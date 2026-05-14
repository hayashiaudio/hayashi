import { memo, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { PatchNode as PatchNodeType } from '@/types/project';
import { useProjectStore } from '@/stores/projectStore';
import { getNodeDefinition } from '@/nodes/registry';
import {
  Music2,
  SlidersHorizontal,
  Disc3,
  Waves,
  Zap,
  Activity,
  Radio,
  Drum,
  MoveRight,
  Cloud,
  Flame,
  ArrowDownNarrowWide,
  Binary,
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
  workstation: 'Workstation',
};

function SamplerWaveform({ peaks }: { peaks: number[] }) {
  const barCount = 40;
  const bars =
    peaks.length > 0
      ? Array.from({ length: barCount }, (_, i) => {
          const idx = Math.floor((i / barCount) * peaks.length);
          return peaks[Math.min(idx, peaks.length - 1)] ?? 0.28;
        })
      : Array.from({ length: barCount }, (_, i) => 0.18 + Math.sin(i * 0.55) * 0.12 + (i % 5 === 0 ? 0.12 : 0.04));

  return (
    <div className="hayashi-sampler-waveform" aria-hidden="true">
      <svg viewBox={`0 0 ${barCount * 3} 30`} preserveAspectRatio="none">
        {bars.map((value, index) => {
          const normalized = Math.max(0.12, Math.min(1, value));
          const height = normalized * 22;
          const y = (30 - height) / 2;
          return (
            <rect
              key={index}
              x={index * 3}
              y={y}
              width="2"
              height={height}
              rx="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

export const PatchNode = memo(function PatchNodeComponent(props: NodeProps) {
  const { data } = props as unknown as { data: PatchNodeType };
  const Icon = kindIcons[data.kind] ?? Music2;
  const definition = getNodeDefinition(data.kind);
  const label = kindLabels[data.kind] ?? data.kind;
  const isOutput = data.kind === 'output';
  const isSourceNode = definition?.category === 'source';
  const samplerAssetId = data.kind === 'sampler' && typeof data.params.assetId === 'string' ? data.params.assetId : null;
  const samplerAsset = useProjectStore((s) => (samplerAssetId ? s.assets[samplerAssetId] : undefined));
  const samplerTitle = samplerAsset?.name ?? (data.kind === 'sampler' ? 'Drop sample' : data.id);
  const samplerPeaks = samplerAsset?.waveformPeaks ?? [];
  const updateNodeParams = useProjectStore((s) => s.updateNodeParams);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const assetId = e.dataTransfer.getData('application/hayashi-asset');
    if (assetId && data.kind === 'sampler') {
      updateNodeParams(data.id, { assetId });
    }
  }, [data.kind, data.id, updateNodeParams]);

  const isSamplerEmpty = data.kind === 'sampler' && !samplerAsset;

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
      {isOutput ? (
        <div className="hayashi-output-node-body" aria-hidden="true">
          <Icon size={26} strokeWidth={1.85} />
        </div>
      ) : isSourceNode ? (
        <div
          className={`hayashi-source-node-card ${isSamplerEmpty && dragOver ? 'hayashi-sampler-dropzone-active' : ''} ${isSamplerEmpty ? 'hayashi-sampler-dropzone' : ''}`}
          onDragOver={isSamplerEmpty ? handleDragOver : undefined}
          onDragLeave={isSamplerEmpty ? handleDragLeave : undefined}
          onDrop={isSamplerEmpty ? handleDrop : undefined}
        >
          <div className="hayashi-source-node-icon" aria-hidden="true">
            <Icon size={18} />
          </div>
          <div className="hayashi-source-node-meta">
            <h3 title={data.kind === 'sampler' ? samplerTitle : definition?.label}>{data.kind === 'sampler' ? samplerTitle : definition?.label ?? data.id}</h3>
            <span>{definition?.description ?? data.id}</span>
          </div>
          {data.kind === 'sampler' ? <SamplerWaveform peaks={samplerPeaks} /> : null}
        </div>
      ) : data.kind === 'sampler' ? (
        <>
          <h3 className="text-sm font-semibold mt-1" title={samplerTitle}>{samplerTitle}</h3>
          <SamplerWaveform peaks={samplerPeaks} />
        </>
      ) : (
        <h3 className="text-sm font-semibold mt-1">{data.id}</h3>
      )}
      {data.kind === 'oscillator' && (
        <div className="text-xs mt-1 opacity-70">{(data.params.frequency as number) ?? 440} Hz</div>
      )}
    </div>
  );
});
