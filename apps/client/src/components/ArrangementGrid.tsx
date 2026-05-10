import { useCallback, useState, useRef, useEffect, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Clip, Track } from '@/types/project';
import { ClipWaveform } from './ClipWaveform';
import { Scissors } from 'lucide-react';

type ResizeSide = 'left' | 'right' | null;

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
  renderTrackHeader?: (track: Track) => ReactNode;
  getTrackSourceKind?: (trackId: string) => string | undefined;
}

const BEAT_WIDTH = 28;
const TRACK_HEIGHT = 48;
const RULER_HEIGHT = 28;
const HEADER_WIDTH = 300;

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
  renderTrackHeader,
  getTrackSourceKind,
}: ArrangementGridProps) {
  const lanesParentRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);

  const resizeState = useRef<{
    clipId: string;
    side: ResizeSide;
    startX: number;
    startBeat: number;
    startLength: number;
  } | null>(null);

  const dragState = useRef<{
    clipId: string;
    startX: number;
    startY: number;
    origStartBeat: number;
    origTrackIndex: number;
    hasMoved: boolean;
    el: HTMLElement | null;
  } | null>(null);

  const totalBeats = Math.max(...clips.map((c) => c.startBeat + c.lengthBeats), 64);
  const timelineWidth = totalBeats * BEAT_WIDTH;

  const snapBeat = (raw: number) => Math.round(raw);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => lanesParentRef.current,
    estimateSize: () => TRACK_HEIGHT,
    overscan: 6,
  });

  /* Keyboard: Delete selected clip */
  useEffect(() => {
    if (!onClipDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          onClipDelete(selectedClipId);
          setSelectedClipId(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedClipId, onClipDelete]);

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
      /* The lane lives inside the scrollable content; getBoundingClientRect()
         already shifts with scroll, so we do NOT add scrollLeft. */
      const lane = e.currentTarget as HTMLElement;
      const rect = lane.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const startBeat = Math.max(0, snapBeat(x / BEAT_WIDTH));
      onAssetDrop(assetId, trackId, startBeat);
    },
    [onAssetDrop]
  );

  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent, clip: Clip) => {
      if ((e.target as HTMLElement).closest('.arrangement-clip-handle, .arrangement-clip-split-btn')) {
        return;
      }
      e.preventDefault();

      dragState.current = {
        clipId: clip.id,
        startX: e.clientX,
        startY: e.clientY,
        origStartBeat: clip.startBeat,
        origTrackIndex: tracks.findIndex((t) => t.id === clip.trackId),
        hasMoved: false,
        el: e.currentTarget as HTMLElement,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragState.current) return;
        const state = dragState.current;
        const dx = moveEvent.clientX - state.startX;
        const dy = moveEvent.clientY - state.startY;

        if (!state.hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          state.hasMoved = true;
          if (state.el) state.el.style.cursor = 'grabbing';
        }

        if (state.hasMoved && state.el) {
          state.el.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        if (!dragState.current) return;
        const state = dragState.current;

        if (state.hasMoved) {
          const grid = lanesParentRef.current;
          if (grid) {
            const rect = grid.getBoundingClientRect();
            const scrollLeft = grid.scrollLeft;
            const scrollTop = grid.scrollTop;
            const x = upEvent.clientX - rect.left + scrollLeft;
            const y = upEvent.clientY - rect.top + scrollTop;
            const startBeat = snapBeat(x / BEAT_WIDTH);
            const trackIndex = Math.floor(y / TRACK_HEIGHT);
            const track = tracks[trackIndex];
            if (track) {
              onClipMove(state.clipId, track.id, Math.max(0, startBeat));
            }
          }
          if (state.el) {
            state.el.style.transform = '';
            state.el.style.cursor = '';
          }
        } else {
          setSelectedClipId((prev) => (prev === state.clipId ? null : state.clipId));
        }

        dragState.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [tracks, onClipMove]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, clip: Clip, side: 'left' | 'right') => {
      e.stopPropagation();
      e.preventDefault();
      resizeState.current = {
        clipId: clip.id,
        side,
        startX: e.clientX,
        startBeat: clip.startBeat,
        startLength: clip.lengthBeats,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizeState.current || !onClipResize) return;
        const state = resizeState.current;
        const deltaPx = moveEvent.clientX - state.startX;
        const deltaBeats = deltaPx / BEAT_WIDTH;

        if (state.side === 'right') {
          const newLength = Math.max(1, snapBeat(state.startLength + deltaBeats));
          onClipResize(state.clipId, state.startBeat, newLength);
        } else {
          const newStart = Math.max(0, snapBeat(state.startBeat + deltaBeats));
          const newEnd = state.startBeat + state.startLength;
          if (newStart >= newEnd - 1) return;
          const newLength = Math.max(1, newEnd - newStart);
          onClipResize(state.clipId, newStart, newLength);
        }
      };

      const handleMouseUp = () => {
        resizeState.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [onClipResize]
  );

  const handleSplit = useCallback(
    (clip: Clip) => {
      if (!onClipSplit) return;
      const splitBeat = clip.startBeat + clip.lengthBeats / 2;
      onClipSplit(clip.id, splitBeat);
    },
    [onClipSplit]
  );

  const handlePlayheadClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onClipSplit || !selectedClipId) return;
      const grid = lanesParentRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const scrollLeft = grid.scrollLeft;
      const scrollTop = grid.scrollTop;
      const x = e.clientX - rect.left + scrollLeft;
      const y = e.clientY - rect.top + scrollTop;
      const clickBeat = x / BEAT_WIDTH;
      const trackIndex = Math.floor(y / TRACK_HEIGHT);
      const track = tracks[trackIndex];
      if (!track) return;

      const clip = clips.find(
        (c) => c.id === selectedClipId && c.trackId === track.id
      );
      if (!clip) return;

      const clipStart = clip.startBeat;
      const clipEnd = clip.startBeat + clip.lengthBeats;
      if (clickBeat > clipStart + 0.5 && clickBeat < clipEnd - 0.5) {
        onClipSplit(clip.id, snapBeat(clickBeat));
      }
    },
    [clips, tracks, selectedClipId, onClipSplit]
  );

  const handlePlayheadDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeekToBeat) return;
      e.preventDefault();
      e.stopPropagation();

      const grid = lanesParentRef.current;
      if (!grid) return;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!onSeekToBeat) return;
        const rect = grid.getBoundingClientRect();
        const scrollLeft = grid.scrollLeft;
        const x = moveEvent.clientX - rect.left + scrollLeft;
        const beat = Math.max(0, x / BEAT_WIDTH);
        onSeekToBeat(beat);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [onSeekToBeat]
  );

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      data-arrangement-grid
      className="arrangement-shell"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
    >
      {/* ── Ruler row ── */}
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid rgba(247,239,215,0.1)',
          background: 'rgba(10,24,18,0.95)',
        }}
      >
        <div style={{ width: HEADER_WIDTH, flexShrink: 0 }} />
        <div ref={rulerRef} style={{ flex: 1, overflow: 'hidden', height: RULER_HEIGHT }}>
          <div className="arrangement-ruler" style={{ display: 'flex', height: RULER_HEIGHT, width: timelineWidth }}>
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
          className="arrangement-headers"
          style={{
            width: HEADER_WIDTH,
            flexShrink: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            borderRight: '1px solid rgba(247,239,215,0.08)',
            background: 'rgba(10,24,18,0.9)',
          }}
        >
          {tracks.map((track) => (
            <div
              key={track.id}
              className="arrangement-track-header"
              style={{
                height: TRACK_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid rgba(247,239,215,0.05)',
              }}
            >
              {renderTrackHeader ? renderTrackHeader(track) : (
                <span style={{ fontSize: 11, color: 'rgba(245,230,200,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track.name}
                </span>
              )}
            </div>
          ))}
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
                position: 'absolute',
                top: 0,
                left: 0,
                width: timelineWidth,
                height: virtualizer.getTotalSize(),
                pointerEvents: 'none',
                zIndex: 1,
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
                      height: TRACK_HEIGHT,
                      position: 'relative',
                      borderBottom: '1px solid rgba(247,239,215,0.05)',
                    }}
                    onDragOver={(e) => handleLaneDragOver(e, track.id)}
                    onDragLeave={handleLaneDragLeave}
                    onDrop={(e) => handleLaneDrop(e, track.id)}
                    onClick={handlePlayheadClick}
                  >
                    {trackClips.map((clip) => {
                      const isSelected = selectedClipId === clip.id;
                      const isHovered = hoveredClipId === clip.id;
                      const safeLength = Number.isFinite(clip.lengthBeats) && clip.lengthBeats > 0 ? clip.lengthBeats : 1;
                      const safeStart = Number.isFinite(clip.startBeat) ? clip.startBeat : 0;
                      const clipWidth = Math.max(safeLength * BEAT_WIDTH, 20);

                      const colorClass =
                        sourceKind === 'sampler' || sourceKind === 'drumPad' || sourceKind === 'micInput'
                          ? 'arrangement-clip-leaf'
                          : sourceKind === 'oscillator' || sourceKind === 'noise'
                            ? 'arrangement-clip-moss'
                            : '';

                      return (
                        <div
                          key={clip.id}
                          onMouseDown={(e) => handleClipMouseDown(e, clip)}
                          onClick={(e) => e.stopPropagation()}
                          onMouseEnter={() => setHoveredClipId(clip.id)}
                          onMouseLeave={() => setHoveredClipId(null)}
                          className={`arrangement-clip ${colorClass} ${isSelected ? 'arrangement-clip-selected' : ''} ${isHovered ? 'arrangement-clip-hover' : ''}`}
                          style={{
                            left: safeStart * BEAT_WIDTH,
                            top: 4,
                            width: clipWidth,
                            height: TRACK_HEIGHT - 8,
                          }}
                        >
                          {clip.assetId && (
                            <div className="arrangement-clip-waveform">
                              <ClipWaveform assetId={clip.assetId} width={clipWidth} height={TRACK_HEIGHT - 8} />
                            </div>
                          )}

                          <div className="arrangement-clip-label">
                            {clip.assetId ? clip.assetId.slice(0, 10) : clip.id.slice(0, 8)}
                            {clip.loop && <span className="arrangement-clip-loop">loop</span>}
                          </div>

                          {onClipResize && (
                            <>
                              <div
                                className="arrangement-clip-handle arrangement-clip-handle-left"
                                onMouseDown={(e) => handleResizeStart(e, clip, 'left')}
                              />
                              <div
                                className="arrangement-clip-handle arrangement-clip-handle-right"
                                onMouseDown={(e) => handleResizeStart(e, clip, 'right')}
                              />
                            </>
                          )}

                          {isSelected && onClipSplit && (
                            <button
                              className="arrangement-clip-split-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSplit(clip);
                              }}
                              title="Split clip at midpoint"
                            >
                              <Scissors size={10} />
                            </button>
                          )}
                        </div>
                      );
                    })}
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
            <div
              className="arrangement-playhead-grab"
              onMouseDown={handlePlayheadDrag}
              title="Drag to seek"
            />
            <div className="arrangement-playhead-line" />
            <div className="arrangement-playhead-head" />
          </div>
        </div>
      </div>
    </div>
  );
}
