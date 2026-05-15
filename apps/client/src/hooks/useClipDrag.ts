import { useCallback, useRef, useEffect } from 'react';
import type { Clip, Track } from '@/types/project';

const BEAT_WIDTH = 28;
const TRACK_HEIGHT = 40;

export interface SnapResult {
  beat: number;
  bar: number;
  isBar: boolean;
}

export interface DragState {
  clipId: string;
  startX: number;
  startY: number;
  origStartBeat: number;
  origTrackIndex: number;
  hasMoved: boolean;
  el: HTMLElement | null;
}

export interface ResizeState {
  clipId: string;
  side: 'left' | 'right';
  startX: number;
  startBeat: number;
  startLength: number;
}

export interface UseClipDragOptions {
  tracks: Track[];
  onClipMove: (clipId: string, trackId: string, startBeat: number) => void;
  onClipResize?: (clipId: string, startBeat: number, lengthBeats: number) => void;
  onClipSplit?: (clipId: string, splitBeat: number) => void;
  onSeekToBeat?: (beat: number) => void;
  onClipDelete?: (clipId: string) => void;
  setSelectedClipId: (id: string | null | ((prev: string | null) => string | null)) => void;
  selectedClipId: string | null;
  getScrollContainer: () => HTMLElement | null;
}

export function useClipDrag({
  tracks,
  onClipMove,
  onClipResize,
  onClipSplit,
  onSeekToBeat,
  onClipDelete,
  setSelectedClipId,
  selectedClipId,
  getScrollContainer,
}: UseClipDragOptions) {
  const dragState = useRef<DragState | null>(null);
  const resizeState = useRef<ResizeState | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const snapLineRef = useRef<HTMLDivElement | null>(null);

  const snapBeat = (raw: number, shiftHeld: boolean) => {
    if (shiftHeld) return Math.max(0, raw);
    return Math.max(0, Math.round(raw));
  };

  const createGhost = (el: HTMLElement) => {
    const ghost = el.cloneNode(true) as HTMLDivElement;
    ghost.classList.add('arrangement-clip-ghost');
    ghost.style.width = el.style.width;
    ghost.style.height = el.style.height;
    ghost.style.left = '0';
    ghost.style.top = '0';
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    return ghost;
  };

  const removeGhost = () => {
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
  };

  const createSnapLine = () => {
    const line = document.createElement('div');
    line.className = 'arrangement-snap-line';
    const tooltip = document.createElement('div');
    tooltip.className = 'arrangement-snap-tooltip';
    line.appendChild(tooltip);
    const container = getScrollContainer();
    if (container) container.appendChild(line);
    snapLineRef.current = line;
    return line;
  };

  const removeSnapLine = () => {
    if (snapLineRef.current) {
      snapLineRef.current.remove();
      snapLineRef.current = null;
    }
  };

  const updateSnapLine = (beat: number, _containerRect: DOMRect, scrollLeft: number) => {
    if (!snapLineRef.current) return;
    const x = beat * BEAT_WIDTH - scrollLeft;
    snapLineRef.current.style.left = `${x}px`;
    const tooltip = snapLineRef.current.querySelector('.arrangement-snap-tooltip') as HTMLElement;
    if (tooltip) {
      const bar = Math.floor(beat / 4) + 1;
      const beatInBar = Math.floor(beat % 4) + 1;
      tooltip.textContent = beatInBar === 1 ? `Bar ${bar}` : `Beat ${Math.round(beat)}`;
    }
  };

  /* ── Clip drag ── */
  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent, clip: Clip) => {
      if ((e.target as HTMLElement).closest('.arrangement-clip-handle, .arrangement-clip-split-btn')) {
        return;
      }
      e.preventDefault();

      const el = e.currentTarget as HTMLElement;
      dragState.current = {
        clipId: clip.id,
        startX: e.clientX,
        startY: e.clientY,
        origStartBeat: clip.startBeat,
        origTrackIndex: tracks.findIndex((t) => t.id === clip.trackId),
        hasMoved: false,
        el,
      };

      const ghost = createGhost(el);
      createSnapLine();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragState.current) return;
        const state = dragState.current;
        const dx = moveEvent.clientX - state.startX;
        const dy = moveEvent.clientY - state.startY;

        if (!state.hasMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          state.hasMoved = true;
          if (state.el) state.el.style.opacity = '0.3';
        }

        if (state.hasMoved && ghost) {
          ghost.style.transform = `translate(${moveEvent.clientX}px, ${moveEvent.clientY}px)`;
          ghost.style.display = 'block';

          const container = getScrollContainer();
          if (container) {
            const rect = container.getBoundingClientRect();
            const scrollLeft = container.scrollLeft;
            const x = moveEvent.clientX - rect.left + scrollLeft;
            const rawBeat = x / BEAT_WIDTH;
            const snapped = snapBeat(rawBeat, moveEvent.shiftKey);
            updateSnapLine(snapped, rect, scrollLeft);
          }
        }
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        if (!dragState.current) return;
        const state = dragState.current;

        if (state.hasMoved) {
          const container = getScrollContainer();
          if (container) {
            const rect = container.getBoundingClientRect();
            const scrollLeft = container.scrollLeft;
            const x = upEvent.clientX - rect.left + scrollLeft;
            const y = upEvent.clientY - rect.top + scrollLeft;
            const startBeat = snapBeat(x / BEAT_WIDTH, upEvent.shiftKey);
            const trackIndex = Math.floor((y - 24) / TRACK_HEIGHT); // 24 = ruler height
            const track = tracks[trackIndex];
            if (track) {
              onClipMove(state.clipId, track.id, Math.max(0, startBeat));
            }
          }
          if (state.el) {
            state.el.style.opacity = '';
          }
        } else {
          setSelectedClipId((prev) => (prev === state.clipId ? null : state.clipId));
        }

        removeGhost();
        removeSnapLine();
        dragState.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [tracks, onClipMove, setSelectedClipId, getScrollContainer]
  );

  /* ── Clip resize ── */
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

      createSnapLine();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizeState.current || !onClipResize) return;
        const state = resizeState.current;
        const deltaPx = moveEvent.clientX - state.startX;
        const deltaBeats = deltaPx / BEAT_WIDTH;

        if (state.side === 'right') {
          const newLength = Math.max(0.5, snapBeat(state.startLength + deltaBeats, moveEvent.shiftKey));
          onClipResize(state.clipId, state.startBeat, newLength);
        } else {
          const newStart = Math.max(0, snapBeat(state.startBeat + deltaBeats, moveEvent.shiftKey));
          const newEnd = state.startBeat + state.startLength;
          if (newStart >= newEnd - 0.5) return;
          const newLength = Math.max(0.5, newEnd - newStart);
          onClipResize(state.clipId, newStart, newLength);
        }

        const container = getScrollContainer();
        if (container) {
          const rect = container.getBoundingClientRect();
          const scrollLeft = container.scrollLeft;
          let snapBeatValue: number;
          if (state.side === 'right') {
            snapBeatValue = state.startBeat + Math.max(0.5, snapBeat(state.startLength + deltaBeats, moveEvent.shiftKey));
          } else {
            snapBeatValue = Math.max(0, snapBeat(state.startBeat + deltaBeats, moveEvent.shiftKey));
          }
          updateSnapLine(snapBeatValue, rect, scrollLeft);
        }
      };

      const handleMouseUp = () => {
        removeSnapLine();
        resizeState.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [onClipResize, getScrollContainer]
  );

  /* ── Clip split ── */
  const handleSplit = useCallback(
    (clip: Clip) => {
      if (!onClipSplit) return;
      const splitBeat = clip.startBeat + clip.lengthBeats / 2;
      onClipSplit(clip.id, splitBeat);
    },
    [onClipSplit]
  );

  /* ── Playhead drag ── */
  const handlePlayheadDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!onSeekToBeat) return;
      e.preventDefault();
      e.stopPropagation();

      const container = getScrollContainer();
      if (!container) return;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!onSeekToBeat) return;
        const rect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
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
    [onSeekToBeat, getScrollContainer]
  );

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId && onClipDelete) {
          e.preventDefault();
          onClipDelete(selectedClipId);
          setSelectedClipId(null);
        }
      }

      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        // Space is handled by WorkstationEditor's togglePlay, not here
      }

      if (e.key === 'd' && (e.metaKey || e.ctrlKey) && selectedClipId) {
        e.preventDefault();
        // Duplicate handled in WorkstationEditor
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedClipId, onClipDelete, setSelectedClipId]);

  return {
    handleClipMouseDown,
    handleResizeStart,
    handleSplit,
    handlePlayheadDrag,
    dragState,
    resizeState,
  };
}
