import { useCallback, useEffect, useRef, memo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionMode,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PatchNode } from './PatchNode';
import { WorkstationNode } from './WorkstationNode';
import { DrumKitNode } from './DrumKitNode';
import { MicInputNode } from './MicInputNode';
import PresenceCursors from './PresenceCursors';
import { TransportBar } from './TransportBar';
import { useProjectStore } from '@/stores/projectStore';
import { compileGraph } from '@/audio/graphCompiler';
import { audioEngine } from '@/audio/engine';
import type { PatchNode as PatchNodeType, PatchEdge as PatchEdgeType } from '@/types/project';
import { getNodeDefinition } from '@/nodes/registry';
import { CustomEdge } from './CustomEdge';
import { canAddNode } from '@/lib/billing';

const nodeTypes: import('@xyflow/react').NodeTypes = {
  patchNode: PatchNode as unknown as import('@xyflow/react').NodeTypes[string],
  workstation: WorkstationNode as unknown as import('@xyflow/react').NodeTypes[string],
  drumPad: DrumKitNode as unknown as import('@xyflow/react').NodeTypes[string],
  micInput: MicInputNode as unknown as import('@xyflow/react').NodeTypes[string],
};
const edgeTypes: import('@xyflow/react').EdgeTypes = {
  custom: CustomEdge as unknown as import('@xyflow/react').EdgeTypes[string],
};
const AUDIBLE_SOURCE_KINDS = new Set<PatchNodeType['kind']>(['oscillator', 'noise', 'sampler', 'drumPad', 'micInput']);

function isValidAudioConnection(
  sourceKind: PatchNodeType['kind'],
  _targetKind: PatchNodeType['kind']
) {
  if (sourceKind === 'output') return false;
  return true;
}

function toFlowNodes(nodes: Record<string, PatchNodeType>): import('@xyflow/react').Node[] {
  return Object.values(nodes).map((n) => ({
    id: n.id,
    type: n.kind === 'workstation' ? 'workstation' : n.kind === 'drumPad' ? 'drumPad' : n.kind === 'micInput' ? 'micInput' : 'patchNode',
    position: n.position,
    data: n as unknown as Record<string, unknown>,
  }));
}

function toFlowEdges(edges: Record<string, PatchEdgeType>): Edge[] {
  return Object.values(edges).map((e) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: 'custom',
    data: { signalType: e.signalType },
    animated: true,
  }));
}

/* ── Inner component: lives inside ReactFlowProvider so useReactFlow works ── */

interface FlowInnerProps {
  storeNodes: Record<string, PatchNodeType>;
  storeEdges: Record<string, PatchEdgeType>;
  storeTracks: Record<string, import('@/types/project').Track>;
  onConnect: (params: Connection) => void;
  onConnectStart?: () => void;
  onConnectEnd?: () => void;
  onNodeClick: (_: React.MouseEvent, node: { id: string }) => void;
  onPaneClick: () => void;
  onNodeRemove: (nodeId: string) => void;
  onNodeDrag: (_: React.MouseEvent, node: { id: string; position: { x: number; y: number } }) => void;
  onNodeDragStop: (_: React.MouseEvent, node: { id: string; position: { x: number; y: number } }) => void;
  onEdgeRemove: (edgeId: string) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

const FlowInner = memo(function FlowInnerComponent({
  storeNodes,
  storeEdges,
  storeTracks,
  onConnect,
  onConnectStart,
  onConnectEnd,
  onNodeClick,
  onPaneClick,
  onNodeRemove,
  onNodeDrag,
  onNodeDragStop,
  onEdgeRemove,
  onDrop,
  onDragOver,
  canvasRef,
}: FlowInnerProps) {
  const [flowNodes, setFlowNodes, onNodesChangeBase] = useNodesState<import('@xyflow/react').Node>([]);
  const [flowEdges, setFlowEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const nodeCount = Object.keys(storeNodes).length;

  useEffect(() => {
    setFlowNodes(toFlowNodes(storeNodes));
  }, [storeNodes, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(toFlowEdges(storeEdges));
  }, [storeEdges, setFlowEdges]);

  const handleConnect = useCallback(
    (params: Connection) => {
      console.log('[Hayashi] React Flow onConnect fired:', params);
      setFlowEdges((current) =>
        addEdge(
          {
            ...params,
            id: crypto.randomUUID(),
            type: 'custom',
            data: { signalType: 'audio' },
            animated: true,
          },
          current
        )
      );
      onConnect(params);
    },
    [onConnect, setFlowEdges]
  );

  const handleNodesChange = useCallback(
    (changes: import('@xyflow/react').NodeChange[]) => {
      onNodesChangeBase(changes);
      for (const change of changes) {
        if (change.type === 'remove') {
          onNodeRemove(change.id);
        }
      }
    },
    [onNodeRemove, onNodesChangeBase]
  );

  const handleEdgesChange = useCallback(
    (changes: import('@xyflow/react').EdgeChange[]) => {
      onEdgesChangeBase(changes);
      for (const change of changes) {
        if (change.type === 'remove') {
          onEdgeRemove(change.id);
        }
      }
    },
    [onEdgeRemove, onEdgesChangeBase]
  );

  // Fit view when node count changes
  useEffect(() => {
    if (nodeCount > 0) {
      const t = setTimeout(() => fitView({ padding: 0.24, duration: 300, maxZoom: 1.02 }), 50);
      return () => clearTimeout(t);
    }
  }, [nodeCount, fitView]);

  // Recompile graph only when audio topology changes (ignore position + params)
  const prevNodeSigRef = useRef('');
  const prevEdgeSigRef = useRef('');

  useEffect(() => {
    const nodeSig = Object.values(storeNodes)
      .map((n) => `${n.id}:${n.kind}:${n.faustModuleId ?? ''}:${n.muted ? 'muted' : 'live'}:${JSON.stringify(n.params)}`)
      .sort()
      .join('|');
    const edgeSig = Object.values(storeEdges)
      .map((e) => `${e.id}:${e.sourceNodeId}->${e.targetNodeId}:${e.sourcePort}:${e.targetPort}`)
      .sort()
      .join('|');

    if (prevNodeSigRef.current !== nodeSig || prevEdgeSigRef.current !== edgeSig) {
      prevNodeSigRef.current = nodeSig;
      prevEdgeSigRef.current = edgeSig;
      compileGraph(storeNodes, storeEdges, storeTracks).catch(console.error);
    }
  }, [storeNodes, storeEdges, storeTracks]);

  return (
    <div
      ref={canvasRef}
      className="hayashi-patch-field"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div style={{ width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.24, maxZoom: 1.02 }}
          minZoom={0.32}
          maxZoom={1.28}
          connectionRadius={32}
          connectionMode={ConnectionMode.Strict}
        >
          <Background color="var(--hayashi-moss)" gap={20} />
          <Controls />
          <PresenceCursors />
        </ReactFlow>
      </div>

      <div className="hayashi-canvas-transport-float">
        <TransportBar />
      </div>
    </div>
  );
});

/* ── Outer component: manages store interactions, wraps inner in Provider ── */

export function PatchCanvas() {
  const selectNode = useProjectStore((s) => s.selectNode);
  const storeNodes = useProjectStore((s) => s.nodes);
  const storeEdges = useProjectStore((s) => s.edges);
  const storeTracks = useProjectStore((s) => s.tracks);
  const addEdgeToStore = useProjectStore((s) => s.addEdge);
  const updateNodePosition = useProjectStore((s) => s.updateNodePosition);
  const removeNode = useProjectStore((s) => s.removeNode);
  const removeEdge = useProjectStore((s) => s.removeEdge);
  const addNode = useProjectStore((s) => s.addNode);
  const billingSnapshot = useProjectStore((s) => s.billing.snapshot);
  const openPaywall = useProjectStore((s) => s.openPaywall);
  const canvasRef = useRef<HTMLDivElement>(null);

  const ensureOutputNode = useCallback(
    (x: number, y: number) => {
      const existing = Object.values(useProjectStore.getState().nodes).find((node) => node.kind === 'output');
      if (existing) return existing;

      const outputNode: PatchNodeType = {
        id: `output-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'output',
        position: { x: x + 240, y },
        params: { gain: 1 },
      };
      addNode(outputNode);
      return outputNode;
    },
    [addNode]
  );

  const connectIfMissing = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      const hasEdge = Object.values(useProjectStore.getState().edges).some(
        (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId
      );
      if (hasEdge) return;

      addEdgeToStore({
        id: crypto.randomUUID(),
        sourceNodeId,
        sourcePort: 'out',
        targetNodeId,
        targetPort: 'in',
        signalType: 'audio',
      });
    },
    [addEdgeToStore]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;

      const state = useProjectStore.getState();
      const sourceNode = state.nodes[params.source];
      const targetNode = state.nodes[params.target];
      if (!sourceNode || !targetNode) return;
      if (!isValidAudioConnection(sourceNode.kind, targetNode.kind)) return;

      const duplicate = Object.values(state.edges).some(
        (edge) => edge.sourceNodeId === params.source && edge.targetNodeId === params.target
      );
      if (duplicate) return;

      const edge: PatchEdgeType = {
        id: crypto.randomUUID(),
        sourceNodeId: params.source!,
        sourcePort: 'out',
        targetNodeId: params.target!,
        targetPort: 'in',
        signalType: 'audio',
      };
      addEdgeToStore(edge);
    },
    [addEdgeToStore]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleConnectStart = useCallback(() => {
    console.log('[Hayashi] React Flow onConnectStart');
  }, []);

  const handleConnectEnd = useCallback(() => {
    console.log('[Hayashi] React Flow onConnectEnd');
  }, []);

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: { id: string; position: { x: number; y: number } }) => {
      updateNodePosition(node.id, node.position);
    },
    [updateNodePosition]
  );

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: { id: string; position: { x: number; y: number } }) => {
      updateNodePosition(node.id, node.position);
    },
    [updateNodePosition]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      /* Sample drop */
      const assetId = e.dataTransfer.getData('application/hayashi-asset');
      if (assetId) {
        const nodeGate = canAddNode(billingSnapshot, useProjectStore.getState().nodes, 'sampler');
        if (!nodeGate.allowed) {
          openPaywall('node_limit', nodeGate.message ?? 'Node limit reached.');
          return;
        }
        const node: PatchNodeType = {
          id: `sampler-${crypto.randomUUID().slice(0, 8)}`,
          kind: 'sampler',
          position: { x, y },
          params: { assetId, playbackRate: 1, loop: true, start: 0, end: 1 },
        };
        addNode(node);
        const outputNode = ensureOutputNode(x, y);
        connectIfMissing(node.id, outputNode.id);

        audioEngine.resume().catch(() => {});
        return;
      }

      /* Built-in node drop */
      const nodePayload = e.dataTransfer.getData('application/hayashi-node');
      if (nodePayload) {
        try {
          const { kind } = JSON.parse(nodePayload) as { kind: string };
          const nodeGate = canAddNode(billingSnapshot, useProjectStore.getState().nodes, kind as PatchNodeType['kind']);
          if (!nodeGate.allowed) {
            openPaywall('node_limit', nodeGate.message ?? 'Node limit reached.');
            return;
          }
          const def = getNodeDefinition(kind as PatchNodeType['kind']);
          const node: PatchNodeType = {
            id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
            kind: kind as PatchNodeType['kind'],
            position: { x, y },
            params: def ? { ...def.defaultParams } : {},
          };
          addNode(node);
          if (AUDIBLE_SOURCE_KINDS.has(node.kind)) {
            const outputNode = ensureOutputNode(x, y);
            connectIfMissing(node.id, outputNode.id);
          }
          audioEngine.resume().catch(() => {});
        } catch {
          // ignore malformed payload
        }
        return;
      }

      /* Faust module drop */
      const faustPayload = e.dataTransfer.getData('application/hayashi-faust');
      if (faustPayload) {
        try {
          const nodeGate = canAddNode(billingSnapshot, useProjectStore.getState().nodes, 'faust');
          if (!nodeGate.allowed) {
            openPaywall('node_limit', nodeGate.message ?? 'Node limit reached.');
            return;
          }
          const { faustModuleId } = JSON.parse(faustPayload) as { faustModuleId: string };
          const node: PatchNodeType = {
            id: `faust-${crypto.randomUUID().slice(0, 8)}`,
            kind: 'faust',
            position: { x, y },
            params: {},
            faustModuleId,
          };
          addNode(node);
          audioEngine.resume().catch(() => {});
        } catch {
          // ignore malformed payload
        }
        return;
      }

      /* Preset drop */
      const presetPayload = e.dataTransfer.getData('application/hayashi-preset');
      if (presetPayload) {
        try {
          const { kind, params } = JSON.parse(presetPayload) as {
            kind: string;
            params: Record<string, number | string | boolean>;
          };
          const nodeGate = canAddNode(billingSnapshot, useProjectStore.getState().nodes, kind as PatchNodeType['kind']);
          if (!nodeGate.allowed) {
            openPaywall('node_limit', nodeGate.message ?? 'Node limit reached.');
            return;
          }
          const node: PatchNodeType = {
            id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
            kind: kind as PatchNodeType['kind'],
            position: { x, y },
            params: { ...params },
          };
          addNode(node);
          if (AUDIBLE_SOURCE_KINDS.has(node.kind)) {
            const outputNode = ensureOutputNode(x, y);
            connectIfMissing(node.id, outputNode.id);
          }
          audioEngine.resume().catch(() => {});
        } catch {
          // ignore malformed payload
        }
      }
    },
    [addNode, billingSnapshot, connectIfMissing, ensureOutputNode, openPaywall]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div className="hayashi-patch-stage" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlowProvider>
        <FlowInner
          storeNodes={storeNodes}
          storeEdges={storeEdges}
          storeTracks={storeTracks}
          onConnect={onConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeRemove={removeNode}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onEdgeRemove={removeEdge}
          onDrop={onDrop}
          onDragOver={onDragOver}
          canvasRef={canvasRef}
        />
      </ReactFlowProvider>
    </div>
  );
}
