import { useCallback, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { ArrowRight } from 'lucide-react';

interface TrackFxChainProps {
  trackId: string;
  fxChain: string[];
  onClose: () => void;
}

const FX_KIND_COLORS: Record<string, string> = {
  filter: '#5a8fb8',
  delay: '#6a9b3d',
  reverb: '#c75b5b',
  gain: '#ed922f',
  distortion: '#d97757',
  compressor: '#a89bcc',
  bitcrusher: '#6f7b5d',
  tremolo: '#d48c2e',
  autopan: '#6a9bcc',
  chorus: '#8fb13a',
  pingPongDelay: '#6a9b3d',
};

const FX_KIND_LABELS: Record<string, string> = {
  filter: 'F',
  delay: 'D',
  reverb: 'R',
  gain: 'G',
  distortion: 'Dst',
  compressor: 'Cmp',
  bitcrusher: 'Bit',
  tremolo: 'Trm',
  autopan: 'APn',
  chorus: 'Chs',
  pingPongDelay: 'PPD',
};

const FX_PARAMS: Record<string, Array<{ key: string; label: string; min: number; max: number }>> = {
  filter: [
    { key: 'frequency', label: 'Cut', min: 20, max: 20000 },
    { key: 'Q', label: 'Res', min: 0, max: 20 },
  ],
  delay: [
    { key: 'delayTime', label: 'Time', min: 0, max: 5 },
    { key: 'feedback', label: 'FB', min: 0, max: 1 },
  ],
  reverb: [
    { key: 'mix', label: 'Mix', min: 0, max: 1 },
  ],
  gain: [
    { key: 'gain', label: 'Gain', min: 0, max: 2 },
  ],
  distortion: [
    { key: 'amount', label: 'Amt', min: 0, max: 1 },
  ],
  compressor: [
    { key: 'threshold', label: 'Thresh', min: -100, max: 0 },
  ],
};

export function TrackFxChain({ trackId, fxChain, onClose }: TrackFxChainProps) {
  const nodes = useProjectStore((s) => s.nodes);
  const updateNodeParams = useProjectStore((s) => s.updateNodeParams);
  const updateTrackFxChain = useProjectStore((s) => s.updateTrackFxChain);

  const processors = useMemo(() => {
    return fxChain
      .map((id) => nodes[id])
      .filter(Boolean)
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        name: node.id.slice(0, 8),
        params: node.params,
      }));
  }, [fxChain, nodes]);

  const handleParamChange = useCallback(
    (nodeId: string, key: string, value: number) => {
      updateNodeParams(nodeId, { [key]: value });
    },
    [updateNodeParams]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const next = fxChain.filter((_, i) => i !== index);
      updateTrackFxChain(trackId, next);
    },
    [fxChain, trackId, updateTrackFxChain]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeId = e.dataTransfer.getData('application/hayashi-node');
      if (!nodeId || fxChain.includes(nodeId)) return;
      const node = nodes[nodeId];
      if (!node) return;
      // Only allow processor kinds
      const processorKinds = new Set([
        'filter', 'delay', 'reverb', 'gain', 'distortion', 'compressor',
        'bitcrusher', 'stereoPanner', 'limiter', 'tremolo', 'autopan',
        'chorus', 'pingPongDelay',
      ]);
      if (!processorKinds.has(node.kind)) return;
      updateTrackFxChain(trackId, [...fxChain, nodeId]);
    },
    [fxChain, nodes, trackId, updateTrackFxChain]
  );

  return (
    <div className="hayashi-daw-fx-row">
      {processors.map((proc, index) => {
        const color = FX_KIND_COLORS[proc.kind] ?? '#ed922f';
        const label = FX_KIND_LABELS[proc.kind] ?? proc.kind.slice(0, 3).toUpperCase();
        const params = FX_PARAMS[proc.kind] ?? [];

        return (
          <div key={proc.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div className="hayashi-daw-fx-slot">
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="hayashi-daw-fx-kind" style={{ color }}>
                  {label}
                </span>
                <span className="hayashi-daw-fx-name">{proc.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                {params.map((p) => (
                  <div key={p.key} className="hayashi-daw-fx-param">
                    <input
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={0.01}
                      value={(proc.params[p.key] as number) ?? p.min}
                      onChange={(e) => handleParamChange(proc.id, p.key, parseFloat(e.target.value))}
                      style={{ width: 14, height: 14, accentColor: color }}
                      title={`${p.label}: ${proc.params[p.key] ?? p.min}`}
                    />
                    <span className="hayashi-daw-fx-param-label">{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => handleRemove(index)}
              type="button"
              title="Remove from chain"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a56767',
                fontSize: '0.5rem',
                cursor: 'pointer',
                padding: 0,
                width: 12,
                height: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
            {index < processors.length - 1 && (
              <ArrowRight size={10} className="hayashi-daw-fx-arrow" />
            )}
          </div>
        );
      })}

      {/* Empty slot (drop target) */}
      <div
        className="hayashi-daw-fx-slot-empty"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        title="Drag processor node here"
      >
        <span style={{ fontSize: '0.8rem', color: '#c8c0b0' }}>+</span>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        type="button"
        style={{
          marginLeft: 'auto',
          background: 'transparent',
          border: 'none',
          color: '#8a7d6a',
          fontSize: '0.55rem',
          cursor: 'pointer',
        }}
      >
        Close
      </button>
    </div>
  );
}
