import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { audioEngine } from '@/audio/engine';
import { triggerPad, stopPad, renderBeat, storeRenderedBeat } from '@/audio/drumEngine';
import { uploadAsset } from '@/lib/api';
import type { Asset } from '@/types/project';
import {
  Square,
  CircleDot,
  Volume2,
  VolumeX,
  Disc3,
  X,
} from 'lucide-react';

const PAD_NAMES = [
  'Kick', 'Snare', 'Clap', 'Hi-Hat',
  'Open Hat', 'Tom', 'Ride', 'Crash',
  'Perc 1', 'Perc 2', 'Perc 3', 'Perc 4',
  'FX 1', 'FX 2', 'FX 3', 'FX 4',
];

function getPadColor(index: number): string {
  const colors = [
    '#ed922f', '#d97757', '#8fb13a', '#6a9bcc',
    '#6f7b5d', '#f6df9f', '#c75b5b', '#5a8fb8',
  ];
  return colors[index % colors.length];
}

/* ── Compact Pad ── */
function DrawerPad({
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
  const color = getPadColor(index);
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
      }}
      onDrop={(e) => {
        e.preventDefault();
        const assetId = e.dataTransfer.getData('application/hayashi-asset');
        if (assetId) onDrop(assetId);
      }}
      className={`hayashi-kit-drawer-pad ${hasAsset ? 'has-asset' : ''} ${muted ? 'is-muted' : ''} ${pressed ? 'is-active' : ''}`}
      style={{ '--pad-accent': color } as React.CSSProperties}
      title={asset ? asset.name : PAD_NAMES[index]}
    >
      <div className="hayashi-kit-drawer-pad-drop" />
      <span className="hayashi-kit-drawer-pad-index">{(index + 1).toString().padStart(2, '0')}</span>
      {hasAsset && <span className="hayashi-kit-drawer-pad-dot" />}
      <span className="hayashi-kit-drawer-pad-name">
        {asset ? asset.name : PAD_NAMES[index]}
      </span>

      {/* Mute toggle — tiny, only visible when hovered or muted */}
      {hasAsset && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMute(e);
          }}
          title={muted ? 'Unmute' : 'Mute'}
          type="button"
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            zIndex: 2,
            width: 14,
            height: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 3,
            border: 'none',
            background: muted ? 'rgba(199,91,91,0.3)' : 'rgba(255,255,255,0.08)',
            color: muted ? '#e08a8a' : 'rgba(255,255,255,0.35)',
            cursor: 'pointer',
            padding: 0,
            opacity: muted ? 1 : 0,
            transition: 'opacity 0.1s ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          {muted ? <VolumeX size={8} /> : <Volume2 size={8} />}
        </button>
      )}
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

  useEffect(() => {
    return () => {
      for (let i = 0; i < 16; i++) {
        stopPad(nodeId, i);
      }
    };
  }, [nodeId]);

  return (
    <div className="hayashi-kit-drawer">
      {/* Header */}
      <div className="hayashi-kit-drawer-header">
        <div className="hayashi-kit-drawer-header-left">
          <span>Drum Kit</span>
          <strong title={nodeId}>{nodeId}</strong>
        </div>
        <div className="hayashi-kit-drawer-header-right">
          {rendering && (
            <span className="hayashi-kit-drawer-status">Rendering…</span>
          )}
          {recording && (
            <span className="hayashi-kit-drawer-status" style={{ color: '#e08a8a' }}>
              {hitCount} hits
            </span>
          )}
          {renderError && (
            <span className="hayashi-kit-drawer-status" style={{ color: '#e08a8a' }}>
              Error
            </span>
          )}
          <button
            className={`hayashi-kit-drawer-strip-btn ${recording ? 'is-recording-drawer' : ''}`}
            onClick={toggleRecord}
            title={recording ? 'Stop & render' : 'Record beat'}
            type="button"
            disabled={rendering}
          >
            {recording ? <Square size={10} /> : <CircleDot size={10} />}
            {recording ? 'Stop' : 'Rec'}
          </button>
          <button
            className="hayashi-kit-drawer-strip-btn"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="hayashi-kit-drawer-body">
        {/* Pad grid */}
        <div className="hayashi-kit-drawer-grid">
          {Array.from({ length: 16 }, (_, i) => (
            <DrawerPad
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

        {/* Control strip */}
        <div className="hayashi-kit-drawer-strip">
          <span className="hayashi-kit-drawer-status">{loadedCount}/16</span>

          {outputAssetId && (
            <button
              className="hayashi-kit-drawer-strip-btn"
              onClick={handlePreviewOutput}
              title="Preview rendered beat"
              type="button"
            >
              <Disc3 size={10} />
              Play
            </button>
          )}

          <button
            className={`hayashi-kit-drawer-strip-btn ${mode === 'live' ? 'is-active-mode' : ''}`}
            onClick={() => handleSwitchMode('live')}
            title="Live mode"
            type="button"
          >
            Live
          </button>
          <button
            className={`hayashi-kit-drawer-strip-btn ${mode === 'rendered' ? 'is-active-mode' : ''}`}
            onClick={() => handleSwitchMode('rendered')}
            title="Rendered mode"
            type="button"
            disabled={!outputAssetId}
          >
            Render
          </button>
        </div>
      </div>
    </div>
  );
}
