import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { getFaustModule } from '@/samples/indexedDb';
import { compileGraph, updateNodeParam } from '@/audio/graphCompiler';
import { getNodeDefinition } from '@/nodes/registry';
import {
  Code2,
  X,
  Activity,
  Music2,
  SlidersHorizontal,
  Waves,
  Zap,
  Radio,
  Drum,
  Mic,
  Clock,
  Cloud,
  Flame,
  ArrowDownNarrowWide,
  Binary,
  MoveRight,
  Disc3,
  LayoutGrid,
  AudioLines,
} from 'lucide-react';
import { FaustEditor } from './FaustEditor';

interface NodeInspectorProps {
  embedded?: boolean;
  onClose?: () => void;
}

type TabKey = 'params' | 'content';

const kindIcons: Record<string, React.ElementType> = {
  oscillator: Activity,
  sampler: Music2,
  filter: SlidersHorizontal,
  output: Waves,
  gain: Zap,
  noise: Radio,
  drumPad: Drum,
  micInput: Mic,
  midiBridge: AudioLines,
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

export function NodeInspector({ embedded = false, onClose }: NodeInspectorProps) {
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const nodes = useProjectStore((s) => s.nodes);
  const updateNodeParams = useProjectStore((s) => s.updateNodeParams);
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const assets = useProjectStore((s) => s.assets);
  const [faustEditorOpen, setFaustEditorOpen] = useState(false);
  const [faustCode, setFaustCode] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('params');
  const [knobDragging, setKnobDragging] = useState<string | null>(null);
  const knobStartRef = useRef({ x: 0, y: 0, value: 0 });

  const node = selectedNodeId ? nodes[selectedNodeId] : null;
  const Icon = node ? (kindIcons[node.kind] ?? Activity) : Activity;
  const definition = node ? getNodeDefinition(node.kind) : null;

  const nodeClips =
    node && node.kind === 'workstation'
      ? Object.values(clips).filter((c) => tracks[c.trackId]?.workstationNodeId === node.id)
      : [];

  const filledPads = useMemo(() => {
    if (!node || node.kind !== 'drumPad') return [];
    return Array.from({ length: 16 }, (_, i) => {
      const assetId = (node.params[`pad${i}`] as string) ?? '';
      const asset = assetId ? assets[assetId] : undefined;
      return { index: i, assetId, asset, name: asset?.name ?? `Pad ${i + 1}` };
    });
  }, [node, assets]);

  useEffect(() => {
    setActiveTab('params');
  }, [node?.id]);

  const handleSliderChange = useCallback(
    (param: string, value: number) => {
      if (!node) return;
      updateNodeParams(node.id, { [param]: value });
      updateNodeParam(node.id, param, value);
    },
    [node?.id, updateNodeParams]
  );

  const handleToggleChange = useCallback(
    (param: string, value: boolean) => {
      if (!node) return;
      updateNodeParams(node.id, { [param]: value });
      const state = useProjectStore.getState();
      const nextNodes = {
        ...state.nodes,
        [node.id]: {
          ...state.nodes[node.id],
          params: { ...state.nodes[node.id].params, [param]: value },
        },
      };
      compileGraph(nextNodes, state.edges).catch(console.error);
    },
    [node, updateNodeParams]
  );

  const handleSelectChange = useCallback(
    (param: string, value: string) => {
      if (!node) return;
      updateNodeParams(node.id, { [param]: value });
      const state = useProjectStore.getState();
      const nextNodes = {
        ...state.nodes,
        [node.id]: {
          ...state.nodes[node.id],
          params: { ...state.nodes[node.id].params, [param]: value },
        },
      };
      compileGraph(nextNodes, state.edges).catch(console.error);
    },
    [node, updateNodeParams]
  );

  const paramEntries = node ? Object.entries(node.params) : [];
  const editableEntries = paramEntries.filter(([k]) => k !== 'pairingId');
  const numericParams = editableEntries.filter(([, v]) => typeof v === 'number');
  const stringParams = editableEntries.filter(([k, v]) => typeof v === 'string' && k !== 'pairingId');
  const boolParams = editableEntries.filter(([, v]) => typeof v === 'boolean');

  const hasContentTab =
    node &&
    (node.kind === 'drumPad' ||
      node.kind === 'sampler' ||
      node.kind === 'workstation' ||
      node.kind === 'faust');

  const startKnobDrag = (key: string, value: number, e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    knobStartRef.current = { x: clientX, y: clientY, value };
    setKnobDragging(key);
  };

  useEffect(() => {
    if (!knobDragging || !node) return;
    const min = getParamMin(knobDragging);
    const max = getParamMax(knobDragging);
    const range = max - min;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - knobStartRef.current.x;
      const dy = knobStartRef.current.y - clientY;
      const delta = (dx + dy) * 0.01 * range;
      const next = Math.min(max, Math.max(min, knobStartRef.current.value + delta));
      handleSliderChange(knobDragging, next);
    };

    const onUp = () => {
      setKnobDragging(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [knobDragging, node, handleSliderChange]);

  if (!node) {
    return (
      <section className={`hayashi-rack-panel ${embedded ? 'hayashi-rack-panel-embedded' : ''}`}>
        <div className="hayashi-rack-screws" />
        <div className="hayashi-rack-empty">
          <Icon size={28} strokeWidth={1.2} />
          <p>No node selected</p>
          <span>Click a node on the canvas to edit parameters</span>
        </div>
      </section>
    );
  }

  return (
    <section className={`hayashi-rack-panel ${embedded ? 'hayashi-rack-panel-embedded' : ''}`}>
      <div className="hayashi-rack-screws" />

      {/* Compact header */}
      <div className="hayashi-rack-header">
        <div className="hayashi-rack-header-left">
          <div className="hayashi-rack-badge">
            <Icon size={13} />
          </div>
          <div>
            <p className="hayashi-rack-label">{definition?.label ?? node.kind}</p>
            <h2 className="hayashi-rack-title">{node.id.slice(0, 16)}</h2>
          </div>
        </div>
        <div className="hayashi-rack-header-right">
          <div className="hayashi-rack-led" data-active="true" />
          <span className="hayashi-rack-status">Live</span>
          {embedded && onClose && (
            <button className="hayashi-rack-close" type="button" onClick={onClose}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs: only when there's a content tab */}
      {hasContentTab && (
        <div className="hayashi-rack-tabs">
          <button
            className={`hayashi-rack-tab ${activeTab === 'params' ? 'hayashi-rack-tab-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('params')}
          >
            Params
          </button>
          <button
            className={`hayashi-rack-tab ${activeTab === 'content' ? 'hayashi-rack-tab-active' : ''}`}
            type="button"
            onClick={() => setActiveTab('content')}
          >
            {node.kind === 'workstation' ? 'Clips' : node.kind === 'faust' ? 'Code' : 'Content'}
          </button>
        </div>
      )}

      {/* Rack body — overflow hidden for no-scroll Discord Activity layout */}
      <div className="hayashi-rack-body">
        {/* PARAMS VIEW — always flat, no scrolling */}
        {(activeTab === 'params' || !hasContentTab) && (
          <div className="hayashi-rack-section">
            {/* Compact param strip */}
            <div className="hayashi-rack-param-strip">
              {/* Numeric knobs */}
              {numericParams.map(([key, value]) => {
                const min = getParamMin(key);
                const max = getParamMax(key);
                const numValue = value as number;
                const pct = (numValue - min) / (max - min);
                const angle = -135 + pct * 270;
                return (
                  <div key={key} className="hayashi-rack-knob-unit">
                    <div
                      className="hayashi-rack-knob"
                      onMouseDown={(e) => startKnobDrag(key, value as number, e)}
                      onTouchStart={(e) => startKnobDrag(key, value as number, e)}
                    >
                      <div
                        className="hayashi-rack-knob-dial"
                        style={{ transform: `rotate(${angle}deg)` }}
                      >
                        <div className="hayashi-rack-knob-marker" />
                      </div>
                      <div className="hayashi-rack-knob-track" />
                    </div>
                    <span className="hayashi-rack-knob-value">{formatValue(key, numValue)}</span>
                    <span className="hayashi-rack-knob-label">{formatParamLabel(key)}</span>
                  </div>
                );
              })}

              {/* String params as inline segmented pills */}
              {stringParams.map(([key, value]) => {
                const options = getStringOptions(key, node.kind);
                if (!options) {
                  return (
                    <div key={key} className="hayashi-rack-info-inline">
                      <span className="hayashi-rack-knob-label">{formatParamLabel(key)}</span>
                      <span className="hayashi-rack-info-value">{value as string}</span>
                    </div>
                  );
                }
                return (
                  <div key={key} className="hayashi-rack-segment-inline">
                    <span className="hayashi-rack-knob-label">{formatParamLabel(key)}</span>
                    <div className="hayashi-rack-segmented compact">
                      {options.map((opt) => (
                        <button
                          key={opt}
                          className={`hayashi-rack-segment ${value === opt ? 'hayashi-rack-segment-active' : ''}`}
                          type="button"
                          onClick={() => handleSelectChange(key, opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Boolean toggles inline */}
              {boolParams.map(([key, value]) => (
                <div key={key} className="hayashi-rack-toggle-inline">
                  <span className="hayashi-rack-knob-label">{formatParamLabel(key)}</span>
                  <button
                    className={`hayashi-rack-toggle mini ${value ? 'hayashi-rack-toggle-on' : ''}`}
                    type="button"
                    onClick={() => handleToggleChange(key, !value)}
                  >
                    <span className="hayashi-rack-toggle-pill" />
                  </button>
                </div>
              ))}

              {/* Pairing code read-only for midiBridge */}
              {node.kind === 'midiBridge' && node.params.pairingId && (
                <div className="hayashi-rack-info-inline">
                  <span className="hayashi-rack-knob-label">Pairing</span>
                  <span className="hayashi-rack-info-value">{node.params.pairingId as string}</span>
                </div>
              )}
            </div>

            {/* Faust source button */}
            {node.kind === 'faust' && node.faustModuleId && (
              <div className="hayashi-rack-faust-row">
                <button
                  className="hayashi-rack-faust-btn"
                  type="button"
                  onClick={async () => {
                    const mod = await getFaustModule(node.faustModuleId!);
                    if (mod) {
                      setFaustCode(mod.dspCode);
                      setFaustEditorOpen(true);
                    }
                  }}
                >
                  <Code2 size={14} />
                  View DSP Source
                </button>
              </div>
            )}
          </div>
        )}

        {/* CONTENT TAB — drum pads, sampler, workstation clips */}
        {activeTab === 'content' && hasContentTab && (
          <div className="hayashi-rack-section">
            {/* Drum pad grid */}
            {node.kind === 'drumPad' && (
              <div className="hayashi-rack-pad-grid">
                {filledPads.map((pad) => (
                  <div
                    key={pad.index}
                    className={`hayashi-rack-pad ${pad.assetId ? 'hayashi-rack-pad-filled' : ''}`}
                    title={pad.asset ? pad.asset.name : `Pad ${pad.index + 1}`}
                  >
                    <span className="hayashi-rack-pad-index">{(pad.index + 1).toString().padStart(2, '0')}</span>
                    <span className="hayashi-rack-pad-name">
                      {pad.asset ? pad.asset.name : `Pad ${pad.index + 1}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Sampler preview */}
            {node.kind === 'sampler' && (
              <div className="hayashi-rack-sampler-preview">
                {(() => {
                  const assetId = (node.params.assetId as string) ?? '';
                  const asset = assetId ? assets[assetId] : undefined;
                  if (!asset) {
                    return (
                      <div className="hayashi-rack-empty mini">
                        <Music2 size={20} strokeWidth={1.2} />
                        <p>No sample loaded</p>
                      </div>
                    );
                  }
                  return (
                    <>
                      <div className="hayashi-rack-sample-header">
                        <Music2 size={16} />
                        <span className="hayashi-rack-sample-name">{asset.name}</span>
                        <span className="hayashi-rack-sample-meta">
                          {asset.durationSeconds.toFixed(1)}s · {asset.sampleRate}Hz · {asset.channels}ch
                        </span>
                      </div>
                      {asset.waveformPeaks && asset.waveformPeaks.length > 0 && (
                        <div className="hayashi-rack-sample-waveform">
                          {asset.waveformPeaks.map((p, i) => (
                            <div
                              key={i}
                              className="hayashi-rack-sample-bar"
                              style={{ height: `${Math.max(4, p * 100)}%` }}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Workstation clips */}
            {node.kind === 'workstation' && (
              <div className="hayashi-rack-clip-list compact">
                {nodeClips.length === 0 ? (
                  <div className="hayashi-rack-empty mini">
                    <LayoutGrid size={20} strokeWidth={1.2} />
                    <p>No clips</p>
                  </div>
                ) : (
                  nodeClips.map((clip) => (
                    <div key={clip.id} className="hayashi-rack-clip">
                      <div className="hayashi-rack-clip-header">
                        <span className="hayashi-rack-clip-name">
                          {clip.assetId ? assets[clip.assetId]?.name?.slice(0, 20) ?? clip.id.slice(0, 12) : clip.id.slice(0, 12)}
                        </span>
                        <span className="hayashi-rack-clip-range">
                          {clip.startBeat.toFixed(1)}–{(clip.startBeat + clip.lengthBeats).toFixed(1)} beats
                        </span>
                      </div>
                      <div className="hayashi-rack-clip-bar">
                        <div
                          className="hayashi-rack-clip-fill"
                          style={{ width: `${Math.min(100, (clip.lengthBeats / 16) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {faustEditorOpen && (
        <FaustEditor initialCode={faustCode} onClose={() => setFaustEditorOpen(false)} />
      )}
    </section>
  );
}

function formatParamLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/_/g, ' ');
}

function formatValue(key: string, value: number): string {
  if (key === 'frequency') return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  if (key === 'pan') return value.toFixed(1);
  return value.toFixed(2);
}

function getParamMin(key: string): number {
  const mins: Record<string, number> = {
    frequency: 20,
    gain: 0,
    Q: 0.1,
    delayTime: 0,
    decay: 0.1,
    mix: 0,
    depth: 0,
    attack: 0,
    release: 0,
    threshold: -60,
    ratio: 1,
    bits: 1,
    sampleRate: 8000,
    playbackRate: 0.1,
    time: 0,
    feedback: 0,
    amount: 0,
    rate: 0.1,
    pan: -1,
    start: 0,
    end: 0,
  };
  return mins[key] ?? 0;
}

function getParamMax(key: string): number {
  const maxes: Record<string, number> = {
    frequency: 20000,
    gain: 1,
    Q: 20,
    delayTime: 5,
    decay: 10,
    mix: 1,
    depth: 1,
    attack: 2,
    release: 5,
    threshold: 0,
    ratio: 20,
    bits: 16,
    sampleRate: 96000,
    playbackRate: 4,
    time: 5,
    feedback: 1,
    amount: 1,
    rate: 20,
    pan: 1,
    start: 1,
    end: 1,
  };
  return maxes[key] ?? 100;
}

function getStringOptions(key: string, kind?: string): string[] | null {
  const opts: Record<string, string[]> = {
    type: ['sine', 'sawtooth', 'square', 'triangle'],
  };
  if (key === 'type') {
    if (kind === 'noise') return ['white', 'pink', 'brown'];
    if (kind === 'filter') return ['lowpass', 'highpass', 'bandpass'];
    return opts[key] ?? null;
  }
  if (key === 'waveform') return ['sine', 'sawtooth', 'square', 'triangle'];
  if (key === 'channelFilter') return ['all', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'];
  return opts[key] ?? null;
}
