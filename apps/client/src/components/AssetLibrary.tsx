import { useState, useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { audioEngine } from '@/audio/engine';
import { decodeAudioFile, generateWaveformPeaks } from '@/samples/import';
import {
  listSamples,
  getSample,
  storeSample,
} from '@/samples/indexedDb';
import { uploadAsset } from '@/lib/api';
import { BUILTIN_NODES, getNodeDefinition, type NodeCategory } from '@/nodes/registry';
import type { Asset, PatchNode } from '@/types/project';
import { canAddNode } from '@/lib/billing';
import {
  Search,
  Upload,
  CloudOff,
  GripVertical,
  Box,
  Music2,
  Code2,
  Bookmark,
  Activity,
  Radio,
  Drum,
  Mic,
  Waves,
  MoveRight,
  Disc3,
  Zap,
  SlidersHorizontal,
  Clock,
  Cloud,
  Flame,
  ArrowDownNarrowWide,
  Binary,
  Clapperboard,
} from 'lucide-react';

/* ─────────────────────────── Icon mapping ─────────────────────────── */

const kindIcons: Record<string, React.ElementType> = {
  oscillator: Activity,
  noise: Radio,
  sampler: Music2,
  drumPad: Drum,
  micInput: Mic,
  gain: Zap,
  filter: SlidersHorizontal,
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
  output: Waves,
  workstation: Clapperboard,
};
const AUDIBLE_SOURCE_KINDS = new Set<PatchNode['kind']>(['oscillator', 'noise', 'sampler', 'drumPad', 'micInput']);

/* ─────────────────────────── Mini waveform ─────────────────────────── */

function MiniWaveformBars({ peaks, colorFrom = '#8fb13a' }: { peaks: number[]; colorFrom?: string }) {
  return (
    <div className="flex items-center gap-px h-9 w-full">
      {peaks.map((p, i) => {
        const h = Math.max(2, p * 36);
        return (
          <span
            key={i}
            style={{
              display: 'block',
              flex: 1,
              minWidth: 1,
              height: `${h}px`,
              borderRadius: 999,
              background: `linear-gradient(180deg, ${colorFrom}, #6f7b5d)`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TAB_META = [
  { key: 'builtins' as const, label: 'Sources', icon: Box },
  { key: 'samples' as const, label: 'Samples', icon: Music2 },
  { key: 'processors' as const, label: 'Processors', icon: Code2 },
  { key: 'output' as const, label: 'Output', icon: Bookmark },
];

type TabKey = (typeof TAB_META)[number]['key'];

const TAB_SEARCH_PLACEHOLDERS: Record<Exclude<TabKey, 'samples'>, string> = {
  builtins: 'Search sources…',
  processors: 'Search processors…',
  output: 'Search output nodes…',
};

const TAB_COPY: Record<TabKey, { eyebrow: string; title: string }> = {
  builtins: { eyebrow: 'Source Assets', title: 'Drag instruments and utilities into the patch.' },
  samples: { eyebrow: 'Sample Assets', title: 'Drop field recordings, loops, and one-shots.' },
  processors: { eyebrow: 'Processing Nodes', title: 'Filter the node library to shaping, dynamics, and modulation tools.' },
  output: { eyebrow: 'Output Nodes', title: 'Filter the node library to sinks and arrangement endpoints.' },
};

/* ─────────────────────────── Component ─────────────────────────── */

export function AssetLibrary() {
  const [activeTab, setActiveTab] = useState<TabKey>('builtins');
  const [query, setQuery] = useState('');

  /* Sample crate */
  const addAsset = useProjectStore((s) => s.addAsset);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const assets = useProjectStore((s) => s.assets);
  const assetList = Object.values(assets).filter((a) => a.kind === 'sample');

  const addNode = useProjectStore((s) => s.addNode);
  const billingSnapshot = useProjectStore((s) => s.billing.snapshot);
  const openPaywall = useProjectStore((s) => s.openPaywall);
  const addEdgeToStore = useProjectStore((s) => s.addEdge);

  /* ---- Sample hydration from IndexedDB ---- */
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        await audioEngine.init();
      } catch {
        // continue anyway
      }

      try {
        const ids = await listSamples();
        for (const id of ids) {
          if (cancelled) return;
          const existing = useProjectStore.getState().assets[id];
          if (existing) continue;

          const record = await getSample(id);
          if (!record) continue;

          const meta = record.meta as {
            duration?: number;
            sampleRate?: number;
            channels?: number;
            waveformPeaks?: number[];
          };

          const asset: Asset = {
            id,
            kind: 'sample',
            name: record.name ?? id,
            mimeType: record.mimeType,
            durationSeconds: (meta.duration ?? 0) as number,
            sampleRate: (meta.sampleRate ?? 44100) as number,
            channels: (meta.channels ?? 1) as number,
            waveformPeaks: meta.waveformPeaks ?? [],
            storageUrl: record.storageUrl,
          };
          addAsset(asset);
        }
      } catch (err) {
        console.error('[Hayashi] Failed to hydrate samples from IndexedDB:', err);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [addAsset]);

  /* ---- Sample upload handlers ---- */
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);

      try {
        await audioEngine.init();
        const ctx = audioEngine.ctx;
        if (!ctx) {
          console.error('[Hayashi] Audio context unavailable');
          return;
        }

        for (const file of Array.from(files)) {
          if (!file.type.startsWith('audio/')) continue;

          const fileBuffer = await file.arrayBuffer();
          const persistentBuffer = fileBuffer.slice(0);
          const decoded = await decodeAudioFile(fileBuffer, ctx, file.name);
          const peaks = generateWaveformPeaks(decoded.buffer, 64);

          let storageUrl: string | undefined;
          try {
            const res = await uploadAsset(persistentBuffer.slice(0));
            storageUrl = res.url;
          } catch {
            // Offline — stay local-only
          }

          await storeSample(decoded.id, file.name, persistentBuffer, file.type, {
            duration: decoded.duration,
            sampleRate: decoded.sampleRate,
            channels: decoded.channels,
            waveformPeaks: peaks,
          }, storageUrl);

          const asset: Asset = {
            id: decoded.id,
            kind: 'sample',
            name: file.name,
            mimeType: file.type,
            durationSeconds: decoded.duration,
            sampleRate: decoded.sampleRate,
            channels: decoded.channels,
            waveformPeaks: peaks,
            storageUrl,
          };
          addAsset(asset);
        }
      } catch (err) {
        console.error('[Hayashi] Failed to import samples:', err);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [addAsset]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  /* onDragLeave intentionally omitted — dragEnter/Leave race conditions are handled by dragOver + drop */

  /* ---- Add built-in node ---- */
  const handleAddNode = useCallback(
    (kind: string, params?: Record<string, number | string | boolean>) => {
      const state = useProjectStore.getState();
      const nodeGate = canAddNode(billingSnapshot, state.nodes, kind as PatchNode['kind']);
      if (!nodeGate.allowed) {
        openPaywall('node_limit', nodeGate.message ?? 'Node limit reached.');
        return;
      }
      const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
      const count = Object.values(state.nodes).filter((n) => n.kind === kind).length;
      const def = getNodeDefinition(kind as PatchNode['kind']);
      const node: PatchNode = {
        id,
        kind: kind as PatchNode['kind'],
        position: { x: 80 + count * 60, y: 80 + count * 40 },
        params: { ...def?.defaultParams, ...params },
      };
      addNode(node);

      if (AUDIBLE_SOURCE_KINDS.has(node.kind)) {
        let outputNode = Object.values(state.nodes).find((existing) => existing.kind === 'output');
        if (!outputNode) {
          outputNode = {
            id: `output-${crypto.randomUUID().slice(0, 8)}`,
            kind: 'output',
            position: { x: node.position.x + 240, y: node.position.y },
            params: { gain: 1 },
          };
          addNode(outputNode);
        }

        const edges = Object.values(useProjectStore.getState().edges);
        const hasDirectOutputEdge = edges.some(
          (edge) => edge.sourceNodeId === node.id && edge.targetNodeId === outputNode.id
        );
        if (!hasDirectOutputEdge) {
          addEdgeToStore({
            id: crypto.randomUUID(),
            sourceNodeId: node.id,
            sourcePort: 'out',
            targetNodeId: outputNode.id,
            targetPort: 'in',
            signalType: 'audio',
          });
        }
      }

      audioEngine.resume().catch(() => {});
    },
    [addEdgeToStore, addNode, billingSnapshot, openPaywall]
  );

  /* ---- Render helpers ---- */

  const filteredBuiltins =
    query.length > 0
      ? BUILTIN_NODES.filter(
          (n) =>
            n.label.toLowerCase().includes(query.toLowerCase()) ||
            n.description.toLowerCase().includes(query.toLowerCase())
        )
      : BUILTIN_NODES;

  const nodeFilterForTab = (tab: Exclude<TabKey, 'samples'>): ((category: NodeCategory) => boolean) => {
    if (tab === 'builtins') return (category) => category === 'source';
    if (tab === 'processors') return (category) => category === 'processor' || category === 'modulator';
    return (category) => category === 'sink' || category === 'utility';
  };

  const filteredNodesForActiveTab =
    activeTab === 'samples'
      ? []
      : filteredBuiltins.filter((node) => nodeFilterForTab(activeTab)(node.category));

  return (
    <div
      className="hayashi-asset-bar"
      onDrop={activeTab === 'samples' ? onDrop : undefined}
      onDragOver={activeTab === 'samples' ? onDragOver : undefined}
      style={{
        borderColor: dragOver ? 'rgba(143, 177, 58, 0.4)' : undefined,
        transition: 'border-color 0.2s',
      }}
    >
      <div className="hayashi-asset-frame">
        <div className="hayashi-asset-body">
          <div className="hayashi-asset-sidebar">
            <div className="hayashi-asset-tabs">
              {TAB_META.map((t) => {
                const isActive = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setActiveTab(t.key);
                      setQuery('');
                    }}
                    className={`hayashi-asset-tab ${isActive ? 'hayashi-asset-tab-active' : ''}`}
                  >
                    <t.icon size={14} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hayashi-asset-main">
            <div className="hayashi-asset-corner">
              <div className="hayashi-asset-copy">
                <span>{TAB_COPY[activeTab].eyebrow}</span>
                <strong>{TAB_COPY[activeTab].title}</strong>
              </div>

              <div className="hayashi-asset-corner-actions">
                {(activeTab === 'builtins' || activeTab === 'processors' || activeTab === 'output') && (
                  <div className="hayashi-asset-search">
                    <Search size={14} />
                    <input
                      type="text"
                      placeholder={TAB_SEARCH_PLACEHOLDERS[activeTab]}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                        color: 'inherit',
                        width: '100%',
                        fontSize: '0.78rem',
                      }}
                    />
                  </div>
                )}

                {activeTab === 'samples' && (
                  <div className="hayashi-asset-upload">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                    <button
                      className="hayashi-icon-button"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload audio"
                    >
                      <Upload size={14} />
                    </button>
                    <span className="hayashi-asset-upload-label">Local</span>
                  </div>
                )}
              </div>
            </div>

            {/* Horizontal scrollable items */}
            <div className={`hayashi-asset-scroll hayashi-asset-scroll-${activeTab}`}>
        {/* ── Built-ins ── */}
        {activeTab === 'builtins' && (
          <>
            {filteredNodesForActiveTab.map((def) => {
              const Icon = kindIcons[def.kind] ?? Box;
              return (
                <div
                  key={def.kind}
                  className="hayashi-asset-chip hayashi-asset-chip-source"
                  draggable
                  onClick={() => handleAddNode(def.kind)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/hayashi-node',
                      JSON.stringify({ kind: def.kind })
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <div className="hayashi-asset-chip-icon">
                    <Icon size={16} />
                  </div>
                  <div className="hayashi-asset-chip-meta">
                    <strong>{def.label}</strong>
                    <span>{def.description}</span>
                  </div>
                  <GripVertical size={14} className="hayashi-asset-chip-drag" />
                </div>
              );
            })}
          </>
        )}

        {/* ── Samples ── */}
        {activeTab === 'samples' && (
          <>
            {assetList.length === 0 && !uploading && (
              <div className="hayashi-asset-empty">
                <CloudOff size={18} />
                <span>Drop audio files here</span>
              </div>
            )}
            {uploading && <span className="hayashi-asset-uploading">Decoding…</span>}
            {assetList.map((asset) => (
                <div
                  key={asset.id}
                  className="hayashi-asset-sample"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/hayashi-asset', asset.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <div className="hayashi-asset-sample-wave">
                  {asset.waveformPeaks && asset.waveformPeaks.length > 0 ? (
                    <MiniWaveformBars peaks={asset.waveformPeaks} />
                  ) : (
                    <MiniWaveformBars peaks={Array.from({ length: 64 }, () => Math.random() * 0.5 + 0.1)} />
                  )}
                </div>
                <div className="hayashi-asset-sample-meta">
                  <strong>{asset.name}</strong>
                  <span>{formatDuration(asset.durationSeconds)}</span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Processors ── */}
        {activeTab === 'processors' && (
          <>
            {filteredNodesForActiveTab.length === 0 && (
              <p className="hayashi-asset-empty-text">No processor nodes match this filter.</p>
            )}
            {filteredNodesForActiveTab.map((def) => {
              const Icon = kindIcons[def.kind] ?? Code2;
              return (
                <div
                  key={def.kind}
                  className="hayashi-asset-chip hayashi-asset-chip-processor"
                  draggable
                  onClick={() => handleAddNode(def.kind)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/hayashi-node',
                      JSON.stringify({ kind: def.kind })
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  <div className="hayashi-asset-chip-icon">
                    <Icon size={16} />
                  </div>
                  <div className="hayashi-asset-chip-meta">
                    <strong>{def.label}</strong>
                    <span>{def.description}</span>
                  </div>
                  <GripVertical size={14} className="hayashi-asset-chip-drag" />
                </div>
              );
            })}
          </>
        )}

        {/* ── Output ── */}
        {activeTab === 'output' && (
          <>
            {filteredNodesForActiveTab.length === 0 && (
              <p className="hayashi-asset-empty-text">No output nodes match this filter.</p>
            )}
            {filteredNodesForActiveTab.map((def) => {
                const OutputIcon = kindIcons[def.kind] ?? Bookmark;
                return (
                  <div
                    key={def.kind}
                    className="hayashi-asset-chip hayashi-asset-chip-output"
                    draggable
                    onClick={() => handleAddNode(def.kind)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/hayashi-node',
                        JSON.stringify({ kind: def.kind })
                      );
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <div className="hayashi-asset-chip-icon">
                      <OutputIcon size={16} />
                    </div>
                    <div className="hayashi-asset-chip-meta">
                      <strong>{def.label}</strong>
                      <span>{def.description}</span>
                    </div>
                    <GripVertical size={14} className="hayashi-asset-chip-drag" />
                  </div>
                );
              })}
          </>
        )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
