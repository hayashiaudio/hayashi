import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';

const SIGNAL_COLORS: Record<string, string> = {
  audio: '#ed922f',
  midi: '#8fb13a',
  control: '#6a9bcc',
  clock: '#d48c2e',
};

export const CustomEdge = memo(function CustomEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const signalType = (data?.signalType as string) ?? 'audio';
  const color = SIGNAL_COLORS[signalType] ?? SIGNAL_COLORS.audio;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: 2,
          opacity: 0.9,
        }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 9,
            fontFamily: 'IBM Plex Mono, monospace',
            color,
            background: 'rgba(16,38,29,0.7)',
            padding: '2px 6px',
            borderRadius: 8,
            pointerEvents: 'all',
          }}
        >
          {signalType}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
