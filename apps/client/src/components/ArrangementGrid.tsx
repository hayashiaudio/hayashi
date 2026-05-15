import { useState, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Clip, Track } from '@/types/project';
import { TrackHeader } from './TrackHeader';
import { ClipLane } from './ClipLane';
import { useClipDrag } from '@/hooks/useClipDrag';

interface ArrangementGridProps {
  clips: Clip[];
  tracks: Track[];
  bpm: number;
  playheadBeat: number;
  onClipMove: (clipId: string, trackId: string, startBeat: number) => void;
  onClipResize?: (clipId: string, startBeat: number, lengthBeats: number) => void;
  onClipSplit?: (clipId: string, splitBeat: number) => void;
  onAssetDrop?: (assetId: string, trackId: string, startBeat: number) => void;
  onSeekToBeat?: (beat: number) => void;
  onClipDelete?: (clipId: string) => void;
  getTrackSourceKind?: (trackId: string) => string | undefined;
  onTrackGainChange?: (trackId: string, value: number) => void;
  onTrackPanChange?: (trackId: string, value: number) => void;
  onTrackMuteToggle?: (track: Track) => void;
  onTrackArmToggle?: (track: Track) => void;
  onTrackPrintClip?: (track: Track) => void;
  onTrackBounce?: (track: Track) => void;
  onTrackRemove?: (track: Track) => void;
  getSourceNode?: (track: Track) => import('@/types/project').PatchNode | null;
  getSourceAssetId?: (source: import('@/types/project').PatchNode | null) => string | undefined;
  assets?: Record<string, import('@/types/project').Asset>;
}

const BEAT_WIDTH = 28;
const TRACK_HEIGHT = 40;
const RULER_HEIGHT = 24;
const HEADER_WIDTH = 160;

export function ArrangementGrid({
  clips,
  tracks,
  playheadBeat,
  onClipMove,
  onClipResize,
  onClipSplit,
  onAssetDrop,
  onSeekToBeat,
  onClipDelete,
  getTrackSourceKind,
  onTrackGainChange,
  onTrackPanChange,
  onTrackMuteToggle,
  onTrackArmToggle,
  onTrackPrintClip,
  onTrackBounce,
  onTrackRemove,
  getSourceNode,
  getSourceAssetId,
  assets,
}: ArrangementGridProps) {
  const lanesParentRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);

  const totalBeats = Math.max(...clips.map((c) => c.startBeat + c.lengthBeats), 64);
  const timelineWidth = totalBeats * BEAT_WIDTH;

  const [expandedFxTrackIds, setExpandedFxTrackIds] = useState<Set<string>>(new Set());

  const isFxOpen = useCallback((trackId: string) => expandedFxTrackIds.has(trackId), [expandedFxTrackIds]);
  const toggleFx = useCallback((trackId: string) => {
    setExpandedFxTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => lanesParentRef.current,
    estimateSize: (index) => (isFxOpen(tracks[index].id) ? 88 : TRACK_HEIGHT),
    overscan: 6,
  });

  const getScrollContainer = useCallback(() => lanesParentRef.current, []);

  const {
    handleClipMouseDown,
    handleResizeStart,
    handleSplit,
    handlePlayheadDrag,
  } = useClipDrag({
    tracks,
    onClipMove,
    onClipResize,
    onClipSplit,
    onSeekToBeat,
    onClipDelete,
    setSelectedClipId,
    selectedClipId,
    getScrollContainer,
  });

  /* Sync vertical scroll between lanes and headers; horizontal scroll between lanes and ruler */
  useEffect(() => {
    const lanes = lanesParentRef.current;
    const headers = headersRef.current;
    const ruler = rulerRef.current;
    if (!lanes || !headers || !ruler) return;

    const onScroll = () => {
      headers.scrollTop = lanes.scrollTop;
      ruler.scrollLeft = lanes.scrollLeft;
    };
    lanes.addEventListener('scroll', onScroll, { passive: true });
    return () => lanes.removeEventListener('scroll', onScroll);
  }, [tracks.length]);

  const handleLaneDragOver = useCallback((e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverTrackId(trackId);
  }, []);

  const handleLaneDragLeave = useCallback(() => {
    setDragOverTrackId(null);
  }, []);

  const handleLaneDrop = useCallback(
    (e: React.DragEvent, trackId: string) => {
      e.preventDefault();
      setDragOverTrackId(null);
      const assetId = e.dataTransfer.getData('application/hayashi-asset');
      if (!assetId || !onAssetDrop) return;
      const lane = e.currentTarget as HTMLElement;
      const rect = lane.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const startBeat = Math.max(0, Math.round(x / BEAT_WIDTH));
      onAssetDrop(assetId, trackId, startBeat);
    },
    [onAssetDrop]
  );


  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div data-arrangement-grid className="arrangement-shell">
      {/* ── Ruler row ── */}
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid rgba(16,38,29,0.09)',
          background: '#f8f3e3',
        }}
      >
        <div style={{ width: HEADER_WIDTH, flexShrink: 0 }} />
        <div ref={rulerRef} style={{ flex: 1, overflow: 'hidden', height: RULER_HEIGHT }}>
          <div className="arrangement-ruler" style={{ width: timelineWidth, height: RULER_HEIGHT }}>
            {Array.from({ length: totalBeats + 1 }, (_, i) => (
              <div key={i} className="arrangement-ruler-mark" style={{ width: BEAT_WIDTH }}>
                {i % 4 === 0 ? (
                  <>
                    <span className="arrangement-ruler-number">{i}</span>
                    <div className="arrangement-ruler-bar" />
                  </>
                ) : (
                  <div className="arrangement-ruler-tick" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body: headers + lanes ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Track headers */}
        <div
          ref={headersRef}
          style={{
            width: HEADER_WIDTH,
            flexShrink: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            borderRight: '1px solid #e8dcc8',
            background: '#f5f0e8',
          }}
        >
          {tracks.map((track) => {
            const source = getSourceNode?.(track) ?? null;
            const assetId = getSourceAssetId?.(source);
            const asset = assetId ? assets?.[assetId] : undefined;

            return (
              <div
                key={track.id}
                style={{
                  height: isFxOpen(track.id) ? 88 : 40,
                  transition: 'height 0.2s ease',
                }}
              >
                <TrackHeader
                  track={track}
                  sourceNode={source}
                  assetName={asset?.name}
                  fxOpen={isFxOpen(track.id)}
                  onFxToggle={() => toggleFx(track.id)}
                  onGainChange={(v) => onTrackGainChange?.(track.id, v)}
                  onPanChange={(v) => onTrackPanChange?.(track.id, v)}
                  onMuteToggle={() => onTrackMuteToggle?.(track)}
                  onArmToggle={() => onTrackArmToggle?.(track)}
                  onPrintClip={() => onTrackPrintClip?.(track)}
                  onBounceTrack={() => onTrackBounce?.(track)}
                  onRemoveTrack={() => onTrackRemove?.(track)}
                />
              </div>
            );
          })}
        </div>

        {/* Timeline lanes */}
        <div ref={lanesParentRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <div
            style={{
              position: 'relative',
              height: virtualizer.getTotalSize(),
              width: timelineWidth,
            }}
          >
            {/* Grid lines */}
            <div
              className="arrangement-grid-lines"
              style={{
                width: timelineWidth,
                height: virtualizer.getTotalSize(),
              }}
            >
              {Array.from({ length: totalBeats + 1 }, (_, i) => (
                <div
                  key={i}
                  className={`arrangement-grid-line ${i % 4 === 0 ? 'arrangement-grid-line-bar' : ''}`}
                  style={{ left: i * BEAT_WIDTH }}
                />
              ))}
            </div>

            {/* Virtual track lanes */}
            {virtualItems.map((virtualItem) => {
              const track = tracks[virtualItem.index];
              const sourceKind = getTrackSourceKind?.(track.id);
              const trackClips = clips.filter((c) => c.trackId === track.id);
              const isDragOver = dragOverTrackId === track.id;
              const trackHeight = isFxOpen(track.id) ? 88 : 40;

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virtualItem.size,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div
                    className={`arrangement-track-lane ${isDragOver ? 'arrangement-track-dragover' : ''}`}
                    style={{
                      height: trackHeight,
                      position: 'relative',
                      borderBottom: '1px solid #e8dcc8',
                      transition: 'height 0.2s ease',
                    }}
                    onDragOver={(e) => handleLaneDragOver(e, track.id)}
                    onDragLeave={handleLaneDragLeave}
                    onDrop={(e) => handleLaneDrop(e, track.id)}
                  >
                    {trackClips.map((clip) => (
                      <ClipLane
                        key={clip.id}
                        clip={clip}
                        isSelected={selectedClipId === clip.id}
                        isHovered={hoveredClipId === clip.id}
                        sourceKind={sourceKind}
                        onMouseDown={handleClipMouseDown}
                        onResizeStart={handleResizeStart}
                        onSplit={handleSplit}
                        onMouseEnter={() => setHoveredClipId(clip.id)}
                        onMouseLeave={() => setHoveredClipId(null)}
                        beatWidth={BEAT_WIDTH}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="arrangement-playhead"
            style={{ left: playheadBeat * BEAT_WIDTH, height: virtualizer.getTotalSize() }}
          >
            <div className="arrangement-playhead-grab" onMouseDown={handlePlayheadDrag} title="Drag to seek" />
            <div className="arrangement-playhead-line" />
            <div className="arrangement-playhead-head" />
          </div>
        </div>
      </div>
    </div>
  );
}
