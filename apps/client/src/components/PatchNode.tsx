import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import {
  Music2,
  SlidersHorizontal,
  Disc3,
  Waves,
  Zap,
  Activity,
  Radio,
  Drum,
  Mic,
  MoveRight,
  Cloud,
  Flame,
  ArrowDownNarrowWide,
  Binary,
  Code2,
  Clock,
  LayoutGrid,
} from 'lucide-react';

const kindIcons: Record<string, React.ElementType> = {
  oscillator: Activity,
  sampler: Music2,
  filter: SlidersHorizontal,
  output: Waves,
  gain: Zap,
  noise: Radio,
  drumPad: Drum,
  micInput: Mic,
  delay: Clock,
  reverb: Cloud,
  distortion: Flame,
  compressor: ArrowDownNarrowWide,
  bitcrusher: Binary,
  stereoPanner: MoveRight,
  limiter: ArrowDownNarrowWide,
  tremolo: Activity,
  autopan: Waves,
  chorus: Disc3,
  pingPongDelay: Clock,
  faust: Code2,
  workstation: LayoutGrid,
};

const kindLabels: Record<string, string> = {
  oscillator: 'Osc',
  sampler: 'Sampler',
  filter: 'Filter',
  output: 'Out',
  gain: 'Gain',
  delay: 'Delay',
  noise: 'Noise',
  drumPad: 'Drum',
  micInput: 'Mic',
  reverb: 'Verb',
  distortion: 'Dist',
  compressor: 'Comp',
  bitcrusher: 'Crush',
  stereoPanner: 'Pan',
  limiter: 'Lim',
  tremolo: 'Trem',
  autopan: 'APan',
  chorus: 'Chorus',
  pingPongDelay: 'Pong',
  faust: 'Faust',
  workstation: 'Workstation',
};

function MiniMeter() {
  return (
    <div className="flex items-end gap-px h-3">
      {[40, 70, 55, 90, 60].map((h, i) => (
        <span key={i} className="w-1 rounded-md" style={{ height: `${h}%`, background: 'var(--hayashi-leaf)' }} />
      ))}
    </div>
  );
}

export const PatchNode = memo(function PatchNodeComponent(props: NodeProps) {
  const { data } = props as unknown as { data: PatchNodeType };
  const Icon = kindIcons[data.kind] ?? Music2;
  const label = kindLabels[data.kind] ?? data.kind;

  return (
    <div className={`hayashi-patch-node hayashi-patch-node-${data.kind}`}>
      <Handle type="target" position={Position.Left} className="hayashi-node-handle hayashi-node-handle-left" />
      <Handle type="source" position={Position.Right} className="hayashi-node-handle hayashi-node-handle-right" />

      <div className="hayashi-patch-node-head">
        <div className="hayashi-node-badge">
          <Icon size={14} />
          {label}
        </div>
        <div className={`hayashi-node-dot ${data.muted ? 'hayashi-node-dot-muted' : ''}`} />
      </div>
      <h3 className="text-sm font-semibold mt-1">{data.id}</h3>
      {data.kind === 'oscillator' && (
        <div className="text-xs mt-1 opacity-70">{(data.params.frequency as number) ?? 440} Hz</div>
      )}
      {data.kind === 'sampler' && <MiniMeter />}
      {data.kind === 'faust' && data.faustModuleId && (
        <div className="text-xs mt-1 opacity-70">{data.faustModuleId}</div>
      )}
    </div>
  );
});
