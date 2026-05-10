import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import { LayoutGrid, Maximize2 } from 'lucide-react';
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
          <LayoutGrid size={14} />
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
      <h3 className="text-sm font-semibold mt-1" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.id}
      </h3>
      <div className="text-xs mt-1 opacity-70">Click expand to edit clips</div>
    </div>
  );
});
