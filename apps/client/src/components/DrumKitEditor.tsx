import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { audioEngine } from '@/audio/engine';
import { triggerPad, stopPad, renderBeat, storeRenderedBeat } from '@/audio/drumEngine';
import { uploadAsset } from '@/lib/api';
import { canUploadSample } from '@/lib/billing';
import type { Asset } from '@/types/project';
import {
  Square,
  CircleDot,
  Volume2,
  VolumeX,
  Disc3,
  GripVertical,
  X,
} from 'lucide-react';

const PAD_NAMES = [
  'Kick', 'Snare', 'Clap', 'Hi-Hat',
  'Open Hat', 'Tom', 'Ride', 'Crash',
  'Perc 1', 'Perc 2', 'Perc 3', 'Perc 4',
  'FX 1', 'FX 2', 'FX 3', 'FX 4',
];

/* Warm earthy accents that sing against cream */
function getPadAccent(index: number): string {
  const colors = [
    '#c76a2e', '#b8563d', '#6a8f3d', '#4a7fa8',
    '#5a6b4a', '#c9a84a', '#a84a4a', '#4a7a9a',
    '#8a6a3a', '#7a5a4a', '#6a7a5a', '#5a6a7a',
    '#9a6a3a', '#7a4a5a', '#5a7a6a', '#6a5a8a',
  ];
  return colors[index % colors.length];
}

/* ── Pad Component ── */
function DrumPad({
  index,
  asset,
  muted,
  onClick,
  onMute,
  onClear,
  onDrop,
}: {
  index: number;
  asset?: Asset;
  muted: boolean;
  onClick: () => void;
  onMute: (e: React.MouseEvent) => void;
  onClear: (e: React.MouseEvent) => void;
  onDrop: (assetId: string) => void;
}) {
  const [pressed, setPressed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const accent = getPadAccent(index);
  const hasAsset = Boolean(asset);

  return (
    <div
      onMouseDown={() => {
        setPressed(true);
        onClick();
      }}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        onClear(e);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const assetId = e.dataTransfer.getData('application/hayashi-asset');
        if (assetId) onDrop(assetId);
      }}
      className={`hayashi-kit-pad ${hasAsset ? 'has-asset' : ''} ${muted ? 'is-muted' : ''} ${pressed ? 'is-active' : ''} ${dragOver ? 'is-dragover' : ''}`}
      style={{ '--pad-accent': accent } as React.CSSProperties}
      title={asset ? asset.name : PAD_NAMES[index]}
    >
      {/* Mini waveform bar for loaded pads */}
      {hasAsset && asset?.waveformPeaks && asset.waveformPeaks.length > 0 && (
        <div className="hayashi-kit-pad-wave" aria-hidden="true">
          {asset.waveformPeaks.slice(0, 12).map((p, i) => (
            <span
              key={i}
              className="hayashi-kit-pad-wave-bar"
              style={{ height: `${Math.max(2, p * 14)}px` }}
            />
          ))}
        </div>
      )}

      <span className="hayashi-kit-pad-index">{(index + 1).toString().padStart(2, '0')}</span>

      <span className="hayashi-kit-pad-name">
        {asset ? asset.name : PAD_NAMES[index]}
      </span>

      {/* Mute toggle */}
      {hasAsset && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMute(e);
          }}
          title={muted ? 'Unmute' : 'Mute'}
          type="button"
          className="hayashi-kit-pad-mute"
        >
          {muted ? <VolumeX size={9} /> : <Volume2 size={9} />}
        </button>
      )}
    </div>
  );
}

/* ── Sample Chip ── */
function SampleChip({ asset }: { asset: Asset }) {
  return (
    <div
      className="hayashi-kit-sample-chip"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/hayashi-asset', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={asset.name}
    >
      <div className="hayashi-kit-sample-wave" aria-hidden="true">
        {asset.waveformPeaks && asset.waveformPeaks.length > 0
          ? asset.waveformPeaks.slice(0, 14).map((p, i) => (
              <span
                key={i}
                className="hayashi-kit-sample-wave-bar"
                style={{ height: `${Math.max(2, p * 16)}px` }}
              />
            ))
          : Array.from({ length: 14 }, () => Math.random() * 0.5 + 0.15).map((p, i) => (
              <span
                key={i}
                className="hayashi-kit-sample-wave-bar"
                style={{ height: `${Math.max(2, p * 16)}px` }}
              />
            ))}
      </div>
      <GripVertical size={10} className="hayashi-kit-sample-grip" />
      <span className="hayashi-kit-sample-name">{asset.name}</span>
    </div>
  );
}

/* ── Main Editor ── */
export function DrumKitEditor({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const nodes = useProjectStore((s) => s.nodes);
  const assets = useProjectStore((s) => s.assets);
  const updateNodeParams = useProjectStore((s) => s.updateNodeParams);
  const updateDrumPadKit = useProjectStore((s) => s.updateDrumPadKit);
  const addAsset = useProjectStore((s) => s.addAsset);

  const node = nodes[nodeId];
  const params = node?.params ?? {};

  const [recording, setRecording] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [hitCount, setHitCount] = useState(0);
  const hitsRef = useRef<Array<{ padIndex: number; when: number }>>([]);

  const getPadAssetId = useCallback(
    (idx: number) => (params[`pad${idx}`] as string) ?? '',
    [params]
  );

  const isPadMuted = useCallback(
    (idx: number) => Boolean(params[`pad${idx}_muted`]),
    [params]
  );

  const getPadAsset = useCallback(
    (idx: number) => {
      const id = getPadAssetId(idx);
      return id ? assets[id] : undefined;
    },
    [getPadAssetId, assets]
  );

  const handlePadClick = useCallback(
    (idx: number) => {
      const assetId = getPadAssetId(idx);
      if (!assetId) return;
      if (!isPadMuted(idx)) {
        triggerPad(nodeId, idx, assetId, { bypassGraph: true }).catch(console.error);
      }
      if (recording && audioEngine.ctx && !isPadMuted(idx)) {
        hitsRef.current.push({ padIndex: idx, when: audioEngine.ctx.currentTime });
        setHitCount((c) => c + 1);
      }
    },
    [nodeId, getPadAssetId, isPadMuted, recording]
  );

  const handleAssetDrop = useCallback(
    (assetId: string, padIndex: number) => {
      const asset = assets[assetId];
      if (!asset) return;
      updateDrumPadKit(nodeId, {
        [`pad${padIndex}`]: assetId,
        [`pad${padIndex}_name`]: asset.name,
      });
    },
    [nodeId, assets, updateDrumPadKit]
  );

  const handleClearPad = useCallback(
    (padIndex: number) => {
      stopPad(nodeId, padIndex);
      updateDrumPadKit(nodeId, {
        [`pad${padIndex}`]: '',
        [`pad${padIndex}_name`]: '',
        [`pad${padIndex}_muted`]: false,
      });
    },
    [nodeId, updateDrumPadKit]
  );

  const handleTogglePadMute = useCallback(
    (padIndex: number) => {
      const muted = !isPadMuted(padIndex);
      if (muted) stopPad(nodeId, padIndex);
      updateDrumPadKit(nodeId, {
        [`pad${padIndex}_muted`]: muted,
      });
    },
    [nodeId, isPadMuted, updateDrumPadKit]
  );

  const toggleRecord = useCallback(async () => {
    await audioEngine.resume().catch(() => {});
    if (recording) {
      setRecording(false);
      const hits = hitsRef.current;
      if (hits.length === 0) return;
      setRendering(true);
      setRenderError(null);
      try {
        const buffer = await renderBeat(hits, (padIndex) => getPadAssetId(padIndex));
        const name = `Kit Beat ${new Date().toLocaleTimeString()}`;
        const { id, durationSeconds, arrayBuffer } = await storeRenderedBeat(buffer, name);

        const state = useProjectStore.getState();
        const currentSamples = Object.values(state.assets).filter((a) => a.kind === 'sample').length;
        const uploadGate = canUploadSample(state.billing.snapshot, currentSamples);
        if (!uploadGate.allowed) {
          state.openPaywall('node_limit', uploadGate.message ?? 'Sample limit reached.');
          throw new Error('Sample limit reached');
        }

        let storageUrl: string | undefined;
        try {
          const res = await uploadAsset(arrayBuffer.slice(0));
          storageUrl = res.url;
        } catch {
          // Offline — stay local-only
        }
        const asset: Asset = {
          id,
          kind: 'sample',
          name,
          mimeType: 'audio/wav',
          durationSeconds,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          localBlobRef: id,
          storageUrl,
        };
        addAsset(asset);
        updateNodeParams(nodeId, { outputAssetId: id, mode: 'rendered' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Render failed';
        setRenderError(msg);
        console.warn('[DrumKitEditor] Render failed', e);
      } finally {
        setRendering(false);
      }
      hitsRef.current = [];
      setHitCount(0);
    } else {
      hitsRef.current = [];
      setHitCount(0);
      setRenderError(null);
      setRecording(true);
    }
  }, [recording, nodeId, getPadAssetId, addAsset, updateNodeParams]);

  const handleSwitchMode = useCallback(
    (mode: string) => {
      updateNodeParams(nodeId, { mode });
    },
    [nodeId, updateNodeParams]
  );

  const handlePreviewOutput = useCallback(() => {
    const outputAssetId = (params.outputAssetId as string) ?? '';
    if (!outputAssetId) return;
    triggerPad(nodeId, -1, outputAssetId, { bypassGraph: true }).catch(console.error);
  }, [nodeId, params.outputAssetId]);

  const loadedCount = Array.from({ length: 16 }, (_, i) => getPadAssetId(i)).filter(Boolean).length;
  const outputAssetId = (params.outputAssetId as string) ?? '';
  const mode = (params.mode as string) ?? 'live';
  const sampleAssets = Object.values(assets).filter((a) => a.kind === 'sample');

  useEffect(() => {
    return () => {
      for (let i = 0; i < 16; i++) {
        stopPad(nodeId, i);
      }
    };
  }, [nodeId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(245, 230, 200, 0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="hayashi-kit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="hayashi-kit-modal-header">
          <div className="hayashi-kit-modal-header-left">
            <span className="hayashi-kit-modal-kicker">Drum Kit</span>
            <strong className="hayashi-kit-modal-title">
              {nodeId.slice(0, 12)}
            </strong>
          </div>
          <div className="hayashi-kit-modal-header-right">
            {rendering && (
              <span className="hayashi-kit-modal-pill is-rendering">Rendering…</span>
            )}
            {recording && (
              <span className="hayashi-kit-modal-pill is-recording">
                {hitCount} hit{hitCount === 1 ? '' : 's'}
              </span>
            )}
            {renderError && (
              <span className="hayashi-kit-modal-pill is-error">Error</span>
            )}
            <button
              className={`hayashi-kit-modal-record-btn ${recording ? 'is-recording' : ''}`}
              onClick={toggleRecord}
              title={recording ? 'Stop & render' : 'Record beat'}
              type="button"
              disabled={rendering}
            >
              {recording ? <Square size={10} /> : <CircleDot size={10} />}
              {recording ? 'Stop' : 'Rec'}
            </button>
            <button
              className="hayashi-kit-modal-close"
              onClick={onClose}
              type="button"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Pad Grid */}
        <div className="hayashi-kit-modal-body">
          <div className="hayashi-kit-pad-grid">
            {Array.from({ length: 16 }, (_, i) => (
              <DrumPad
                key={i}
                index={i}
                asset={getPadAsset(i)}
                muted={isPadMuted(i)}
                onClick={() => handlePadClick(i)}
                onMute={(e) => {
                  e.stopPropagation();
                  handleTogglePadMute(i);
                }}
                onClear={(e) => {
                  e.stopPropagation();
                  handleClearPad(i);
                }}
                onDrop={(assetId) => handleAssetDrop(assetId, i)}
              />
            ))}
          </div>

          {/* Mode + Preview strip */}
          <div className="hayashi-kit-controls">
            <span className="hayashi-kit-controls-count">
              {loadedCount}<span>/16</span>
            </span>

            <div className="hayashi-kit-controls-modes">
              <button
                className={`hayashi-kit-mode-btn ${mode === 'live' ? 'is-active' : ''}`}
                onClick={() => handleSwitchMode('live')}
                type="button"
              >
                Live
              </button>
              <button
                className={`hayashi-kit-mode-btn ${mode === 'rendered' ? 'is-active' : ''}`}
                onClick={() => handleSwitchMode('rendered')}
                type="button"
                disabled={!outputAssetId}
              >
                Render
              </button>
            </div>

            {outputAssetId && (
              <button
                className="hayashi-kit-preview-btn"
                onClick={handlePreviewOutput}
                title="Preview rendered beat"
                type="button"
              >
                <Disc3 size={11} />
                Play
              </button>
            )}
          </div>
        </div>

        {/* Sample strip */}
        <div className="hayashi-kit-sample-strip">
          {sampleAssets.length > 0 ? (
            sampleAssets.map((asset) => (
              <SampleChip key={asset.id} asset={asset} />
            ))
          ) : (
            <span className="hayashi-kit-sample-empty">
              Drag samples from the library onto pads
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
