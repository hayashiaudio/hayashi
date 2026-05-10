import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { audioEngine } from '@/audio/engine';
import { triggerPad, stopPad, renderBeat, storeRenderedBeat } from '@/audio/drumEngine';
import type { Asset } from '@/types/project';
import { Play, Square, CircleDot, Plus, X, Volume2, VolumeX, Disc3 } from 'lucide-react';

const PAD_NAMES = [
  'Kick', 'Snare', 'Clap', 'Hi-Hat',
  'Open Hat', 'Tom', 'Ride', 'Crash',
  'Perc 1', 'Perc 2', 'Perc 3', 'Perc 4',
  'FX 1', 'FX 2', 'FX 3', 'FX 4',
];

function getPadColor(index: number): string {
  const colors = ['#ed922f', '#d97757', '#8fb13a', '#6a9bcc', '#6f7b5d', '#f6df9f'];
  return colors[index % colors.length];
}

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

  const sampleAssets = useMemo(
    () => Object.values(assets).filter((a) => a.kind === 'sample' || a.kind === 'stem'),
    [assets]
  );

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
        triggerPad(nodeId, idx, assetId).catch(console.error);
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
      if (muted) {
        stopPad(nodeId, padIndex);
      }
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
        const { id, durationSeconds } = await storeRenderedBeat(buffer, name);
        const asset: Asset = {
          id,
          kind: 'sample',
          name,
          mimeType: 'audio/wav',
          durationSeconds,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          localBlobRef: id,
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
    triggerPad(nodeId, -1, outputAssetId).catch(console.error);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="hayashi-surface"
        style={{
          width: 960,
          height: 640,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="hayashi-panel-header" style={{ flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <span className="hayashi-kicker-app">Drum Kit</span>
            <strong className="hayashi-title-display" style={{ fontSize: '1rem' }}>
              {nodeId}
            </strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`hayashi-daw-tbtn ${recording ? 'is-recording' : ''}`}
              onClick={toggleRecord}
              title={recording ? 'Stop recording and render' : 'Start recording'}
              type="button"
            >
              {recording ? <Square size={14} /> : <CircleDot size={14} />}
            </button>
            {rendering && (
              <span className="hayashi-status-pill" style={{ animation: 'pulse 1s infinite' }}>
                Rendering…
              </span>
            )}
            <button className="hayashi-btn-ghost hayashi-button-xs" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-3 px-4 py-2"
          style={{ borderBottom: '1px solid var(--hayashi-border)', flexShrink: 0 }}
        >
          <div className="flex items-center gap-2">
            <span className="hayashi-status-pill">{loadedCount} pads loaded</span>
            <span className="hayashi-status-pill">{hitCount} hits</span>
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--hayashi-text-dim)', letterSpacing: '0.02em' }}>
            Click pads to trigger · Drag samples from sidebar
          </span>
          {renderError && (
            <span className="hayashi-status-pill" style={{ color: '#d95757', borderColor: '#d95757' }}>
              {renderError}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {outputAssetId && (
              <>
                <span className="hayashi-status-pill hayashi-status-pill-bpm">
                  <Disc3 size={10} /> Rendered
                </span>
                <button
                  className="hayashi-btn-ghost hayashi-button-xs"
                  onClick={handlePreviewOutput}
                  type="button"
                >
                  <Play size={12} /> Preview
                </button>
              </>
            )}
            <button
              className={`hayashi-btn-ghost hayashi-button-xs ${mode === 'live' ? 'is-active' : ''}`}
              onClick={() => handleSwitchMode('live')}
              type="button"
            >
              Live
            </button>
            <button
              className={`hayashi-btn-ghost hayashi-button-xs ${mode === 'rendered' ? 'is-active' : ''}`}
              onClick={() => handleSwitchMode('rendered')}
              type="button"
              disabled={!outputAssetId}
            >
              Rendered
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ height: 544, display: 'flex', overflow: 'hidden' }}>
          {/* Asset sidebar */}
          <div
            style={{
              width: 220,
              flexShrink: 0,
              borderRight: '1px solid var(--hayashi-border)',
              overflow: 'auto',
              padding: 12,
            }}
          >
            <p className="hayashi-mini-label" style={{ marginBottom: 10 }}>
              Samples
            </p>
            {sampleAssets.length === 0 && (
              <p className="text-xs opacity-50">No samples yet.</p>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {sampleAssets.map((asset) => (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/hayashi-asset', asset.id);
                  }}
                  className="hayashi-asset-chip"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: 'rgba(250,249,245,0.06)',
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.75rem',
                    color: 'rgba(245,230,200,0.85)',
                  }}
                >
                  <Volume2 size={12} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pad grid */}
          <div style={{ width: 740, display: 'flex', flexDirection: 'column', padding: 20, overflow: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 112px)',
                gap: 12,
              }}
            >
              {Array.from({ length: 16 }, (_, i) => {
                const asset = getPadAsset(i);
                const hasAsset = Boolean(asset);
                const muted = isPadMuted(i);
                return (
                  <div
                    key={i}
                    onClick={() => handlePadClick(i)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleClearPad(i);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const assetId = e.dataTransfer.getData('application/hayashi-asset');
                      if (assetId) handleAssetDrop(assetId, i);
                    }}
                    className={`hayashi-drum-pad ${hasAsset ? 'has-asset' : ''} ${muted ? 'is-muted' : ''}`}
                    style={{
                      position: 'relative',
                      width: 112,
                      height: 112,
                      borderRadius: 12,
                      background: hasAsset
                        ? `linear-gradient(180deg, rgba(16,38,29,0.7), rgba(16,38,29,0.9))`
                        : 'rgba(16,38,29,0.4)',
                      border: `1px solid ${hasAsset ? getPadColor(i) + '40' : 'rgba(247,239,215,0.06)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      transition: 'all 0.08s ease',
                      userSelect: 'none',
                    }}
                  >
                    {/* Top controls */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        right: 6,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTogglePadMute(i); }}
                        style={{
                          pointerEvents: 'auto',
                          background: 'transparent',
                          border: 'none',
                          padding: 2,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: muted ? 1 : 0.4,
                        }}
                        title={muted ? 'Unmute' : 'Mute'}
                        type="button"
                      >
                        {muted ? <VolumeX size={12} color="#d95757" /> : <Volume2 size={12} color="rgba(245,230,200,0.5)" />}
                      </button>
                      {hasAsset && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClearPad(i); }}
                          style={{
                            pointerEvents: 'auto',
                            background: 'transparent',
                            border: 'none',
                            padding: 2,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0.4,
                          }}
                          title="Clear sample"
                          type="button"
                        >
                          <X size={12} color="rgba(245,230,200,0.5)" />
                        </button>
                      )}
                    </div>

                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: 'rgba(245,230,200,0.35)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {PAD_NAMES[i]}
                    </span>
                    {asset ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontFamily: "'Poppins', Arial, sans-serif",
                          color: muted ? 'rgba(245,230,200,0.3)' : getPadColor(i),
                          maxWidth: '90%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={asset.name}
                      >
                        {asset.name}
                      </span>
                    ) : (
                      <Plus size={14} style={{ color: 'rgba(245,230,200,0.2)' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
