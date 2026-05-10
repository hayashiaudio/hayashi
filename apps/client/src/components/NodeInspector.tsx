import { useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { getFaustModule } from '@/samples/indexedDb';
import { compileGraph, updateNodeParam } from '@/audio/graphCompiler';
import { Search, Drum, Code2, X } from 'lucide-react';
import { FaustEditor } from './FaustEditor';

interface NodeInspectorProps {
  embedded?: boolean;
  onClose?: () => void;
}

export function NodeInspector({ embedded = false, onClose }: NodeInspectorProps) {
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const nodes = useProjectStore((s) => s.nodes);
  const updateNodeParams = useProjectStore((s) => s.updateNodeParams);
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const assets = useProjectStore((s) => s.assets);
  const [faustEditorOpen, setFaustEditorOpen] = useState(false);
  const [faustCode, setFaustCode] = useState('');

  const node = selectedNodeId ? nodes[selectedNodeId] : null;

  const nodeClips = node && node.kind === 'workstation'
    ? Object.values(clips).filter((c) => tracks[c.trackId]?.workstationNodeId === node.id)
    : [];

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
        [node.id]: { ...state.nodes[node.id], params: { ...state.nodes[node.id].params, [param]: value } },
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
        [node.id]: { ...state.nodes[node.id], params: { ...state.nodes[node.id].params, [param]: value } },
      };
      compileGraph(nextNodes, state.edges).catch(console.error);
    },
    [node, updateNodeParams]
  );

  const paramEntries = node ? Object.entries(node.params) : [];

  if (!node) {
    return (
      <section className={`hayashi-mockup-panel hayashi-inspector-panel ${embedded ? 'hayashi-inspector-panel-embedded' : ''}`}>
        <div className="hayashi-panel-title-row">
          <div>
            <p className="hayashi-mini-label">Focused Node</p>
            <h2>No selection</h2>
          </div>
        </div>
        <p className="text-sm opacity-60 p-4">Click a node on the canvas to edit parameters.</p>
      </section>
    );
  }

  return (
    <section className={`hayashi-mockup-panel hayashi-inspector-panel ${embedded ? 'hayashi-inspector-panel-embedded' : ''}`}>
      <div className="hayashi-panel-title-row hayashi-inspector-heading">
        <div>
          <p className="hayashi-mini-label">Focused Node</p>
          <h2>{node.id}</h2>
        </div>
        <div className="hayashi-inspector-heading-actions">
          <div className="hayashi-status">
            <span className="hayashi-status-dot" />
            Live
          </div>
          {embedded && onClose ? (
            <button
              className="hayashi-inspector-close"
              type="button"
              onClick={onClose}
              aria-label="Close focused node editor"
              title="Close focused node editor"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Workstation clip list */}
      {node.kind === 'workstation' && (
        <div className="hayashi-inspector-block">
          <div className="hayashi-slider-head">
            <label>Arrangement</label>
            <strong>{nodeClips.length} clips</strong>
          </div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {nodeClips.map((clip) => (
              <div
                key={clip.id}
                style={{
                  padding: '6px 10px',
                  borderRadius: 12,
                  background: 'rgba(250,249,245,0.06)',
                  fontSize: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{clip.assetId?.slice(0, 12) ?? clip.id.slice(0, 12)}</span>
                <span style={{ opacity: 0.6 }}>
                  {clip.startBeat.toFixed(1)}–{(clip.startBeat + clip.lengthBeats).toFixed(1)} beats
                </span>
              </div>
            ))}
            {nodeClips.length === 0 && (
              <p className="text-xs opacity-50">No clips. Drag samples onto the workstation editor.</p>
            )}
          </div>
        </div>
      )}

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

      {/* Faust module info */}
      {node.kind === 'faust' && node.faustModuleId && (
        <div className="hayashi-inspector-block">
          <div className="hayashi-slider-head">
            <label>Faust Module</label>
            <strong>{node.faustModuleId}</strong>
          </div>
          <button
            className="hayashi-secondary-action hayashi-button-xs"
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
            View Source
          </button>
        </div>
      )}

      {paramEntries.length === 0 && (
        <p className="text-sm opacity-60 p-4">No parameters for this node.</p>
      )}

      {paramEntries.map(([key, value]) => {
        if (typeof value === 'number') {
          const min = getParamMin(key);
          const max = getParamMax(key);
          return (
            <div key={key} className="hayashi-inspector-block">
              <div className="hayashi-slider-head">
                <label>{formatParamLabel(key)}</label>
                <strong>{value.toFixed(1)}</strong>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={(max - min) / 100}
                value={value}
                onChange={(e) => handleSliderChange(key, parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: '#ed922f',
                }}
              />
            </div>
          );
        }

        if (typeof value === 'boolean') {
          return (
            <div key={key} className="hayashi-inspector-block">
              <div className="hayashi-slider-head">
                <label>{formatParamLabel(key)}</label>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => handleToggleChange(key, e.target.checked)}
                  style={{ accentColor: '#ed922f' }}
                />
              </div>
            </div>
          );
        }

        if (typeof value === 'string') {
          const options = getStringOptions(key, node.kind);
          if (options) {
            return (
              <div key={key} className="hayashi-inspector-block">
                <div className="hayashi-slider-head">
                  <label>{formatParamLabel(key)}</label>
                </div>
                <select
                  value={value}
                  onChange={(e) => handleSelectChange(key, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 16,
                    border: '1px solid rgba(16,38,29,0.1)',
                    background: 'rgba(255,255,255,0.5)',
                    fontFamily: 'inherit',
                  }}
                >
                  {options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            );
          }
          return (
            <div key={key} className="hayashi-inspector-block">
              <div className="hayashi-slider-head">
                <label>{formatParamLabel(key)}</label>
                <strong>{value}</strong>
              </div>
            </div>
          );
        }

        return null;
      })}

      <div className="hayashi-inspector-actions">
        <button className="hayashi-action" type="button">
          <Search size={15} />
          Semantic search presets
        </button>
        <button className="hayashi-secondary-action" type="button">
          <Drum size={15} />
          Save to preset vault
        </button>
      </div>

      {faustEditorOpen && (
        <FaustEditor
          initialCode={faustCode}
          onClose={() => setFaustEditorOpen(false)}
        />
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

  return opts[key] ?? null;
}
