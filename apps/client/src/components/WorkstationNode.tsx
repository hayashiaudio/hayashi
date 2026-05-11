import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import { Clapperboard, Maximize2 } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';

export const WorkstationNode = memo(function WorkstationNodeComponent(props: NodeProps) {
  const { data } = props as unknown as { data: PatchNodeType };
  const openWorkstationEditor = useProjectStore((s) => s.openWorkstationEditor);

  return (
    <div className="hayashi-patch-node hayashi-patch-node-workstation">
      <Handle type="target" position={Position.Left} className="hayashi-node-handle hayashi-node-handle-left" />
      <Handle type="source" position={Position.Right} className="hayashi-node-handle hayashi-node-handle-right" />

      <div className="hayashi-patch-node-head">
        <div className="hayashi-node-badge">
          <Clapperboard size={14} />
          Workstation
        </div>
        <button
          className="hayashi-icon-button"
          onClick={() => openWorkstationEditor(data.id)}
          title="Open arrangement editor"
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <div className="hayashi-workstation-node-card">
        <div className="hayashi-workstation-node-icon" aria-hidden="true">
          <Clapperboard size={18} />
        </div>
        <div className="hayashi-workstation-node-meta">
          <h3 title={data.id}>{data.id}</h3>
          <span>Clip arrangement and print lanes</span>
        </div>
      </div>
    </div>
  );
});
