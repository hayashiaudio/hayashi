# Drum Kit Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing `drumPad` node into an MPC-style 16-pad drum kit with a popup editor, live triggering, asset assignment, and render-to-sample recording.

**Architecture:** A custom React Flow node shell (`DrumKitNode`) opens a modal popup (`DrumKitEditor`) via store state (`drumKitEditorNodeId`). The audio layer (`drumEngine.ts`) manages live pad triggers into submix buses and an offline render pipeline that produces a WAV Asset stored in IndexedDB. The graph compiler switches the `drumPad` audio behavior between live submix and rendered sampler based on a `mode` param.

**Tech Stack:** React 19, Vite, TypeScript, `@xyflow/react`, Web Audio API, Zustand, Tailwind CSS.

---

## File Structure

### Create
- `apps/client/src/audio/drumEngine.ts` — Live pad triggers, submix bus map, offline render, WAV encoding.
- `apps/client/src/components/DrumKitNode.tsx` — React Flow custom node shell for `drumPad` with expand button.
- `apps/client/src/components/DrumKitEditor.tsx` — Popup editor: 4x4 pad grid, asset sidebar, record/transport controls.

### Modify
- `apps/client/src/stores/projectStore.ts` — Add `drumKitEditorNodeId`, `openDrumKitEditor`, `closeDrumKitEditor`, `updateDrumPadKit`.
- `apps/client/src/audio/graphCompiler.ts` — Rewrite `drumPad` compile case for live/rendered modes.
- `apps/client/src/components/PatchCanvas.tsx` — Register `drumPad` custom node type in `nodeTypes` and `toFlowNodes`.
- `apps/client/src/components/StudioScreen.tsx` — Conditionally render `DrumKitEditor` when `drumKitEditorNodeId` is set.
- `apps/client/src/components/NodeInspector.tsx` — Add drum kit pad summary and output asset info.
- `apps/client/src/index.css` — Pad grid, active glow, record pulse, drum kit node styles.

---

## Task 1: Project Store Additions

**Files:**
- Modify: `apps/client/src/stores/projectStore.ts`

- [ ] **Step 1: Add drum kit editor state and actions**

In the `ProjectState` interface, add after `workstationEditorNodeId`:

```typescript
  drumKitEditorNodeId: string | null;
  openDrumKitEditor: (nodeId: string) => void;
  closeDrumKitEditor: () => void;
  updateDrumPadKit: (nodeId: string, assignments: Record<string, number | string | boolean>) => void;
```

In the store implementation, add after `closeWorkstationEditor`:

```typescript
  drumKitEditorNodeId: null,
  openDrumKitEditor: (nodeId) => set({ drumKitEditorNodeId: nodeId }),
  closeDrumKitEditor: () => set({ drumKitEditorNodeId: null }),
  updateDrumPadKit: (nodeId, assignments) =>
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      return {
        nodes: {
          ...s.nodes,
          [nodeId]: { ...node, params: { ...node.params, ...assignments } },
        },
      };
    }),
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/stores/projectStore.ts
git commit -m "feat(store): drumKitEditor state + updateDrumPadKit action"
```

---

## Task 2: Audio Engine — drumEngine.ts

**Files:**
- Create: `apps/client/src/audio/drumEngine.ts`

- [ ] **Step 1: Write drumEngine.ts**

```typescript
import { audioEngine } from './engine';
import { getCachedSampleBuffer } from './graphCompiler';
import { getSample, storeSample } from '@/samples/indexedDb';

export interface DrumHit {
  padIndex: number;
  when: number; // AudioContext.currentTime
}

const submixes = new Map<string, GainNode>();

export function registerSubmix(nodeId: string, gain: GainNode) {
  submixes.set(nodeId, gain);
}

export function unregisterSubmix(nodeId: string) {
  const gain = submixes.get(nodeId);
  if (gain) {
    try { gain.disconnect(); } catch { /* already disconnected */ }
    submixes.delete(nodeId);
  }
}

export function getSubmix(nodeId: string): GainNode | null {
  return submixes.get(nodeId) ?? null;
}

export async function triggerPad(nodeId: string, padIndex: number, assetId: string) {
  const ctx = audioEngine.ctx;
  if (!ctx) return;
  if (!assetId) return;

  const buffer = await getCachedSampleBuffer(assetId, ctx);
  if (!buffer) {
    console.warn('[drumEngine] Sample not found for pad', padIndex, assetId);
    return;
  }

  const submix = submixes.get(nodeId) ?? audioEngine.destination;
  if (!submix) return;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(submix);
  const now = ctx.currentTime;
  src.start(now);

  src.onended = () => {
    try { src.disconnect(); } catch { /* already disconnected */ }
  };
}

function interleaveChannels(buffer: AudioBuffer): Float32Array {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const interleaved = new Float32Array(ch0.length * 2);
  for (let i = 0; i < ch0.length; i++) {
    interleaved[i * 2] = ch0[i];
    interleaved[i * 2 + 1] = ch1[i];
  }
  return interleaved;
}

function floatTo16BitPCM(input: Float32Array): DataView {
  const view = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return view;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const interleaved = interleaveChannels(buffer);
  const pcm = floatTo16BitPCM(interleaved);
  const headerSize = 44;
  const totalSize = headerSize + pcm.byteLength;
  const wav = new ArrayBuffer(totalSize);
  const view = new DataView(wav);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcm.byteLength, true);

  const pcmBytes = new Uint8Array(pcm.buffer);
  const wavBytes = new Uint8Array(wav, headerSize);
  wavBytes.set(pcmBytes, 0);

  return new Blob([wav], { type: 'audio/wav' });
}

export async function renderBeat(
  hits: DrumHit[],
  getAssetIdForPad: (padIndex: number) => string
): Promise<AudioBuffer> {
  const ctx = audioEngine.ctx;
  if (!ctx) throw new Error('AudioContext not ready');

  const sampleRate = ctx.sampleRate;
  let duration = 0;
  const scheduled: Array<{ buffer: AudioBuffer; when: number }> = [];

  for (const hit of hits) {
    const assetId = getAssetIdForPad(hit.padIndex);
    if (!assetId) continue;
    const buffer = await getCachedSampleBuffer(assetId, ctx);
    if (!buffer) continue;
    const end = hit.when + buffer.duration;
    if (end > duration) duration = end;
    scheduled.push({ buffer, when: hit.when });
  }

  if (duration === 0) throw new Error('No valid hits to render');

  const frames = Math.ceil(duration * sampleRate);
  const offline = new OfflineAudioContext(2, frames, sampleRate);

  for (const { buffer, when } of scheduled) {
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.connect(offline.destination);
    src.start(when);
  }

  return offline.startRendering();
}

export async function storeRenderedBeat(
  buffer: AudioBuffer,
  name: string
): Promise<{ id: string; durationSeconds: number }> {
  const blob = encodeWav(buffer);
  const id = `asset-${crypto.randomUUID().slice(0, 8)}`;
  const arrayBuffer = await blob.arrayBuffer();
  await storeSample(id, new Uint8Array(arrayBuffer), { name, mimeType: 'audio/wav' });
  return { id, durationSeconds: buffer.duration };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/audio/drumEngine.ts
git commit -m "feat(audio): drumEngine with live triggers, offline render, WAV encode"
```

---

## Task 3: React Flow Node Shell — DrumKitNode.tsx

**Files:**
- Create: `apps/client/src/components/DrumKitNode.tsx`

- [ ] **Step 1: Create DrumKitNode.tsx**

```typescript
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import { Drum, Maximize2 } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';

export const DrumKitNode = memo(function DrumKitNodeComponent(props: NodeProps) {
  const { data } = props as unknown as { data: PatchNodeType };
  const openDrumKitEditor = useProjectStore((s) => s.openDrumKitEditor);

  const padCount = Array.from({ length: 16 }, (_, i) => (data.params[`pad${i}`] as string) ?? '').filter(Boolean).length;
  const outputAssetId = (data.params.outputAssetId as string) ?? '';

  return (
    <div className="hayashi-patch-node hayashi-patch-node-drum">
      <Handle type="target" position={Position.Left} className="hayashi-node-handle hayashi-node-handle-left" />
      <Handle type="source" position={Position.Right} className="hayashi-node-handle hayashi-node-handle-right" />

      <div className="hayashi-patch-node-head">
        <div className="hayashi-node-badge">
          <Drum size={14} />
          Drum Kit
        </div>
        <button
          className="hayashi-icon-button"
          onClick={() => openDrumKitEditor(data.id)}
          title="Open drum kit editor"
          type="button"
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <h3
        className="text-sm font-semibold mt-1"
        style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {data.id}
      </h3>
      <div className="text-xs mt-1 opacity-70">
        {padCount} pads · {outputAssetId ? 'Rendered' : 'Live'}
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/DrumKitNode.tsx
git commit -m "feat(ui): DrumKitNode React Flow shell with expand button"
```

---

## Task 4: PatchCanvas Registration

**Files:**
- Modify: `apps/client/src/components/PatchCanvas.tsx`

- [ ] **Step 1: Import and register DrumKitNode**

At the top of `PatchCanvas.tsx`, add import:

```typescript
import { DrumKitNode } from './DrumKitNode';
```

Update `nodeTypes`:

```typescript
const nodeTypes: import('@xyflow/react').NodeTypes = {
  patchNode: PatchNode as unknown as import('@xyflow/react').NodeTypes[string],
  workstation: WorkstationNode as unknown as import('@xyflow/react').NodeTypes[string],
  drumPad: DrumKitNode as unknown as import('@xyflow/react').NodeTypes[string],
};
```

Update `toFlowNodes`:

```typescript
function toFlowNodes(nodes: Record<string, PatchNodeType>): import('@xyflow/react').Node[] {
  return Object.values(nodes).map((n) => ({
    id: n.id,
    type: n.kind === 'workstation' ? 'workstation' : n.kind === 'drumPad' ? 'drumPad' : 'patchNode',
    position: n.position,
    data: n as unknown as Record<string, unknown>,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/PatchCanvas.tsx
git commit -m "feat(ui): register drumPad as custom React Flow node type"
```

---

## Task 5: StudioScreen — Mount DrumKitEditor

**Files:**
- Modify: `apps/client/src/components/StudioScreen.tsx`

- [ ] **Step 1: Import and conditionally render DrumKitEditor**

At the top, add import:

```typescript
import { DrumKitEditor } from './DrumKitEditor';
```

Inside `StudioScreen`, read the store state:

```typescript
  const drumKitEditorNodeId = useProjectStore((s) => s.drumKitEditorNodeId);
  const closeDrumKitEditor = useProjectStore((s) => s.closeDrumKitEditor);
```

After the `workstationEditorNodeId` conditional block, add:

```typescript
      {drumKitEditorNodeId && (
        <DrumKitEditor
          nodeId={drumKitEditorNodeId}
          onClose={closeDrumKitEditor}
        />
      )}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/StudioScreen.tsx
git commit -m "feat(ui): mount DrumKitEditor conditionally in StudioScreen"
```

---

## Task 6: Graph Compiler — drumPad Case Rewrite

**Files:**
- Modify: `apps/client/src/audio/graphCompiler.ts`

- [ ] **Step 1: Import drumEngine helpers**

At the top of `graphCompiler.ts`, add:

```typescript
import { registerSubmix, unregisterSubmix } from './drumEngine';
```

In the `cleanupGraph` function, after clearing track buses, add:

```typescript
  for (const runtime of graph.nodes.values()) {
    if (runtime.kind === 'drumPad') {
      unregisterSubmix(runtime.id);
    }
  }
```

- [ ] **Step 2: Rewrite the drumPad case**

Replace the existing `case 'drumPad':` block (lines ~310-334) with:

```typescript
      case 'drumPad': {
        const mode = (node.params.mode as string) ?? 'live';
        const outputAssetId = (node.params.outputAssetId as string) ?? '';

        if (mode === 'rendered' && outputAssetId) {
          const buffer = await getCachedSampleBuffer(outputAssetId, ctx);
          if (!buffer) break;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = Boolean(node.params.outputLoop);
          const output = createSourceOutput(ctx, node.muted ? 0 : ((node.params.gain as number) ?? 0.8));
          source.connect(output);
          audioNode = output;
          sourceNode = source;
          if (!isSequenced) {
            source.start();
          }
        } else {
          const submix = ctx.createGain();
          submix.gain.value = node.muted ? 0 : ((node.params.gain as number) ?? 0.8);
          audioNode = submix;
          registerSubmix(node.id, submix);
        }
        break;
      }
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/audio/graphCompiler.ts
git commit -m "feat(audio): drumPad compiles as live submix or rendered sampler"
```

---

## Task 7: DrumKitEditor Popup

**Files:**
- Create: `apps/client/src/components/DrumKitEditor.tsx`

- [ ] **Step 1: Write DrumKitEditor.tsx**

```typescript
import { useState, useCallback, useRef, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { audioEngine } from '@/audio/engine';
import { triggerPad, renderBeat, storeRenderedBeat } from '@/audio/drumEngine';
import type { Asset } from '@/types/project';
import { Play, Square, CircleDot, Plus, X, Volume2, Disc3 } from 'lucide-react';

const PAD_NAMES = [
  'Kick', 'Snare', 'Clap', 'Hi-Hat',
  'Open Hat', 'Tom', 'Ride', 'Crash',
  'Perc 1', 'Perc 2', 'Perc 3', 'Perc 4',
  'FX 1', 'FX 2', 'FX 3', 'FX 4',
];

function getPadColor(index: number): string {
  const colors = ['#ed922f', '#d97757', '#8fb13a', '#6a9bcc', '#6f7b5d', '#f6df9f'];
  return colors[index % colors.length];
}

export function DrumKitEditor({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const nodes = useProjectStore((s) => s.nodes);
  const assets = useProjectStore((s) => s.assets);
  const updateNodeParams = useProjectStore((s) => s.updateNodeParams);
  const updateDrumPadKit = useProjectStore((s) => s.updateDrumPadKit);
  const addAsset = useProjectStore((s) => s.addAsset);

  const node = nodes[nodeId];
  const params = node?.params ?? {};

  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [rendering, setRendering] = useState(false);
  const hitsRef = useRef<Array<{ padIndex: number; when: number }>>([]);
  const startTimeRef = useRef(0);

  const sampleAssets = useMemo(
    () => Object.values(assets).filter((a) => a.kind === 'sample' || a.kind === 'stem'),
    [assets]
  );

  const getPadAssetId = useCallback(
    (idx: number) => (params[`pad${idx}`] as string) ?? '',
    [params]
  );

  const getPadAsset = useCallback(
    (idx: number) => {
      const id = getPadAssetId(idx);
      return id ? assets[id] : undefined;
    },
    [getPadAssetId, assets]
  );

  const handlePadClick = useCallback(
    (idx: number) => {
      const assetId = getPadAssetId(idx);
      if (!assetId) {
        setSelectedPad(idx);
        return;
      }
      triggerPad(nodeId, idx, assetId).catch(console.error);
      setSelectedPad(idx);
      if (recording && audioEngine.ctx) {
        hitsRef.current.push({ padIndex: idx, when: audioEngine.ctx.currentTime });
      }
    },
    [nodeId, getPadAssetId, recording]
  );

  const handleAssetDrop = useCallback(
    (assetId: string, padIndex: number) => {
      const asset = assets[assetId];
      if (!asset) return;
      updateDrumPadKit(nodeId, {
        [`pad${padIndex}`]: assetId,
        [`pad${padIndex}_name`]: asset.name,
      });
      if (selectedPad === padIndex) {
        setSelectedPad(null); // force refresh
        setTimeout(() => setSelectedPad(padIndex), 0);
      }
    },
    [nodeId, assets, updateDrumPadKit, selectedPad]
  );

  const handleClearPad = useCallback(
    (padIndex: number) => {
      updateDrumPadKit(nodeId, {
        [`pad${padIndex}`]: '',
        [`pad${padIndex}_name`]: '',
      });
    },
    [nodeId, updateDrumPadKit]
  );

  const toggleRecord = useCallback(async () => {
    await audioEngine.resume().catch(() => {});
    if (recording) {
      setRecording(false);
      const hits = hitsRef.current;
      if (hits.length === 0) return;
      setRendering(true);
      try {
        const buffer = await renderBeat(hits, (padIndex) => getPadAssetId(padIndex));
        const name = `Kit Beat ${new Date().toLocaleTimeString()}`;
        const { id, durationSeconds } = await storeRenderedBeat(buffer, name);
        const asset: Asset = {
          id,
          kind: 'sample',
          name,
          mimeType: 'audio/wav',
          durationSeconds,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          localBlobRef: id,
        };
        addAsset(asset);
        updateNodeParams(nodeId, { outputAssetId: id, mode: 'rendered' });
      } catch (e) {
        console.warn('[DrumKitEditor] Render failed', e);
      } finally {
        setRendering(false);
      }
      hitsRef.current = [];
    } else {
      hitsRef.current = [];
      if (audioEngine.ctx) {
        startTimeRef.current = audioEngine.ctx.currentTime;
      }
      setRecording(true);
    }
  }, [recording, nodeId, getPadAssetId, addAsset, updateNodeParams]);

  const handleSwitchMode = useCallback(
    (mode: string) => {
      updateNodeParams(nodeId, { mode });
    },
    [nodeId, updateNodeParams]
  );

  const handlePreviewOutput = useCallback(() => {
    const outputAssetId = (params.outputAssetId as string) ?? '';
    if (!outputAssetId) return;
    triggerPad(nodeId, -1, outputAssetId).catch(console.error);
  }, [nodeId, params.outputAssetId]);

  const loadedCount = Array.from({ length: 16 }, (_, i) => getPadAssetId(i)).filter(Boolean).length;
  const outputAssetId = (params.outputAssetId as string) ?? '';
  const mode = (params.mode as string) ?? 'live';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="hayashi-surface"
        style={{
          width: 'min(1000px, 94vw)',
          height: 'min(720px, 85vh)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="hayashi-panel-header" style={{ flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <span className="hayashi-kicker-app">Drum Kit</span>
            <strong className="hayashi-title-display" style={{ fontSize: '1rem' }}>
              {nodeId}
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`hayashi-daw-tbtn ${recording ? 'is-recording' : ''}`}
              onClick={toggleRecord}
              title={recording ? 'Stop recording and render' : 'Start recording'}
              type="button"
            >
              {recording ? <Square size={14} /> : <CircleDot size={14} />}
            </button>
            {rendering && (
              <span className="hayashi-status-pill" style={{ animation: 'pulse 1s infinite' }}>
                Rendering…
              </span>
            )}
            <button className="hayashi-btn-ghost hayashi-button-xs" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-3 px-4 py-2"
          style={{ borderBottom: '1px solid var(--hayashi-border)', flexShrink: 0 }}
        >
          <div className="flex items-center gap-2">
            <span className="hayashi-status-pill">{loadedCount} pads loaded</span>
            <span className="hayashi-status-pill">{hitsRef.current.length} hits</span>
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--hayashi-text-dim)', letterSpacing: '0.02em' }}>
            Click pads to trigger · Drag samples from sidebar
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {outputAssetId && (
              <>
                <span className="hayashi-status-pill hayashi-status-pill-bpm">
                  <Disc3 size={10} /> Rendered
                </span>
                <button
                  className="hayashi-btn-ghost hayashi-button-xs"
                  onClick={handlePreviewOutput}
                  type="button"
                >
                  <Play size={12} /> Preview
                </button>
              </>
            )}
            <button
              className={`hayashi-btn-ghost hayashi-button-xs ${mode === 'live' ? 'is-active' : ''}`}
              onClick={() => handleSwitchMode('live')}
              type="button"
            >
              Live
            </button>
            <button
              className={`hayashi-btn-ghost hayashi-button-xs ${mode === 'rendered' ? 'is-active' : ''}`}
              onClick={() => handleSwitchMode('rendered')}
              type="button"
              disabled={!outputAssetId}
            >
              Rendered
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Asset sidebar */}
          <div
            style={{
              width: 220,
              flexShrink: 0,
              borderRight: '1px solid var(--hayashi-border)',
              overflow: 'auto',
              padding: 12,
            }}
          >
            <p className="hayashi-mini-label" style={{ marginBottom: 10 }}>
              Samples
            </p>
            {sampleAssets.length === 0 && (
              <p className="text-xs opacity-50">No samples yet.</p>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {sampleAssets.map((asset) => (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/hayashi-asset', asset.id);
                  }}
                  className="hayashi-asset-chip"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: 'rgba(250,249,245,0.06)',
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.75rem',
                    color: 'rgba(245,230,200,0.85)',
                  }}
                >
                  <Volume2 size={12} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pad grid + detail */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 20 }}>
            {/* 4x4 Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                maxWidth: 520,
                margin: '0 auto',
              }}
            >
              {Array.from({ length: 16 }, (_, i) => {
                const asset = getPadAsset(i);
                const isSelected = selectedPad === i;
                const hasAsset = Boolean(asset);
                return (
                  <div
                    key={i}
                    onClick={() => handlePadClick(i)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleClearPad(i);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const assetId = e.dataTransfer.getData('application/hayashi-asset');
                      if (assetId) handleAssetDrop(assetId, i);
                    }}
                    className={`hayashi-drum-pad ${isSelected ? 'is-selected' : ''} ${hasAsset ? 'has-asset' : ''}`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 12,
                      background: hasAsset
                        ? `linear-gradient(180deg, rgba(16,38,29,0.7), rgba(16,38,29,0.9))`
                        : 'rgba(16,38,29,0.4)',
                      border: `1px solid ${hasAsset ? getPadColor(i) + '40' : 'rgba(247,239,215,0.06)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      transition: 'all 0.08s ease',
                      userSelect: 'none',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: 'rgba(245,230,200,0.35)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {PAD_NAMES[i]}
                    </span>
                    {asset ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontFamily: "'Poppins', Arial, sans-serif",
                          color: getPadColor(i),
                          maxWidth: '90%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={asset.name}
                      >
                        {asset.name}
                      </span>
                    ) : (
                      <Plus size={14} style={{ color: 'rgba(245,230,200,0.2)' }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Selected pad detail */}
            {selectedPad !== null && (
              <div
                style={{
                  marginTop: 20,
                  padding: 14,
                  borderRadius: 12,
                  background: 'rgba(250,249,245,0.04)',
                  border: '1px solid rgba(247,239,215,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: getPadColor(selectedPad),
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.78rem', color: 'rgba(245,230,200,0.6)', margin: 0 }}>
                    Pad {selectedPad + 1} · {PAD_NAMES[selectedPad]}
                  </p>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: 'rgba(245,230,200,0.9)',
                      margin: '4px 0 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {getPadAsset(selectedPad)?.name ?? 'No sample assigned'}
                  </p>
                </div>
                {getPadAssetId(selectedPad) && (
                  <button
                    className="hayashi-btn-ghost hayashi-button-xs"
                    onClick={() => handleClearPad(selectedPad)}
                    type="button"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/DrumKitEditor.tsx
git commit -m "feat(ui): DrumKitEditor with 4x4 grid, asset sidebar, record + render"
```

---

## Task 8: NodeInspector Drum Kit Section

**Files:**
- Modify: `apps/client/src/components/NodeInspector.tsx`

- [ ] **Step 1: Add drum kit summary to inspector**

After the `workstation` block (line ~120), add:

```typescript
      {/* Drum kit pad list */}
      {node.kind === 'drumPad' && (
        <div className="hayashi-inspector-block">
          <div className="hayashi-slider-head">
            <label>Pads</label>
            <strong>
              {Array.from({ length: 16 }, (_, i) => (node.params[`pad${i}`] as string) ?? '').filter(Boolean).length} / 16
            </strong>
          </div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {Array.from({ length: 16 }, (_, i) => {
              const assetId = (node.params[`pad${i}`] as string) ?? '';
              const asset = assetId ? assets[assetId] : undefined;
              return (
                <div
                  key={i}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 12,
                    background: 'rgba(250,249,245,0.06)',
                    fontSize: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Pad {i + 1}</span>
                  <span style={{ opacity: asset ? 0.9 : 0.4 }}>
                    {asset ? asset.name.slice(0, 20) : 'Empty'}
                  </span>
                </div>
              );
            })}
          </div>
          {(node.params.outputAssetId as string) && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--hayashi-ember)' }}>
              Output: {(assets[(node.params.outputAssetId as string)]?.name ?? node.params.outputAssetId as string).slice(0, 24)}
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/NodeInspector.tsx
git commit -m "feat(ui): drum kit pad list + output asset in NodeInspector"
```

---

## Task 9: CSS Styles

**Files:**
- Modify: `apps/client/src/index.css`

- [ ] **Step 1: Append drum kit styles**

Add at the end of `index.css`:

```css
/* Drum Kit Node */
.hayashi-patch-node-drum {
  background:
    linear-gradient(180deg, rgba(237,146,47,0.10), rgba(237,146,47,0.02)),
    linear-gradient(180deg, #1a382b 0%, #10261d 100%);
  border-color: rgba(237,146,47,0.20);
}

/* Drum Pads */
.hayashi-drum-pad {
  position: relative;
}

.hayashi-drum-pad:hover {
  border-color: rgba(247,239,215,0.15) !important;
  background: rgba(16,38,29,0.55) !important;
}

.hayashi-drum-pad.is-selected {
  border-color: rgba(237,146,47,0.60) !important;
  box-shadow: 0 0 12px rgba(237,146,47,0.15);
}

.hayashi-drum-pad:active,
.hayashi-drum-pad.is-active {
  transform: scale(0.97);
  background: rgba(237,146,47,0.12) !important;
  box-shadow: 0 0 20px rgba(237,146,47,0.25);
}

/* Record button pulse */
.is-recording {
  animation: hayashi-record-pulse 1.2s infinite ease-in-out;
  color: #d95757 !important;
  border-color: #d95757 !important;
}

@keyframes hayashi-record-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(217,87,87,0.4); }
  50% { opacity: 0.85; box-shadow: 0 0 0 8px rgba(217,87,87,0); }
}

/* Asset chip in sidebar */
.hayashi-asset-chip:hover {
  background: rgba(250,249,245,0.10) !important;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/index.css
git commit -m "style: drum kit node, pad grid, record pulse CSS"
```

---

## Task 10: Recompile Graph on Drum Kit Param Changes

**Files:**
- Modify: `apps/client/src/components/NodeInspector.tsx`

- [ ] **Step 1: Ensure param changes recompile for drumPad**

The `handleSelectChange` and `handleToggleChange` functions already call `compileGraph`. The `handleSliderChange` calls `updateNodeParam` which only updates runtime params, not triggering recompile. For drumPad `mode` and `outputLoop` toggles, `handleToggleChange` is correct. For `gain` slider, `handleSliderChange` uses `updateNodeParam` which is fine since gain is a live AudioParam on the GainNode.

No code change needed — the existing inspector logic already handles drumPad params correctly because it uses the same generic param rendering.

- [ ] **Step 2: Verify in PatchCanvas.tsx that node sig includes params**

In `PatchCanvas.tsx`, the node signature already includes `JSON.stringify(n.params)`:

```typescript
const nodeSig = Object.values(storeNodes)
  .map((n) => `${n.id}:${n.kind}:${n.faustModuleId ?? ''}:${n.muted ? 'muted' : 'live'}:${JSON.stringify(n.params)}`)
  .sort()
  .join('|');
```

This means any drum kit pad assignment change will trigger a graph recompile, which is correct because the graph compiler needs to know whether `mode` changed or new pads were assigned.

- [ ] **Step 3: Commit (if no changes, just verify)**

No changes needed in this task — existing logic covers it. Mark as verified.

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| 16 assignable pads in 4x4 grid | Task 7 |
| Asset sidebar with drag-and-drop | Task 7 |
| Live pad triggering | Task 2, Task 6 |
| Record mode + hit capture | Task 7 |
| Offline render to AudioBuffer | Task 2 |
| WAV encoding + IndexedDB Asset storage | Task 2 |
| Graph compiler live/rendered modes | Task 6 |
| Custom React Flow node shell | Task 3, Task 4 |
| Popup editor in StudioScreen | Task 5, Task 7 |
| Store state + batch pad updates | Task 1 |
| Node inspector drum kit info | Task 8 |
| CSS styling | Task 9 |
| Graph recompile on param changes | Task 10 (verified) |

**Gaps:** None.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-09-drum-kit-editor.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
