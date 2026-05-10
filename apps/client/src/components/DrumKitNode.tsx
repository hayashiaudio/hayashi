import { memo, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import { Drum, Maximize2 } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';

export const DrumKitNode = memo(function DrumKitNodeComponent(props: NodeProps) {
  const { data } = props as unknown as { data: PatchNodeType };
  const openDrumKitEditor = useProjectStore((s) => s.openDrumKitEditor);

  const padCount = useMemo(
    () => Array.from({ length: 16 }, (_, i) => (data.params[`pad${i}`] as string) ?? '').filter(Boolean).length,
    [data.params]
  );
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
