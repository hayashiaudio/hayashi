import { useCallback } from 'react';
import { Scissors } from 'lucide-react';
import type { Clip } from '@/types/project';
import { ClipWaveform } from './ClipWaveform';

interface ClipLaneProps {
  clip: Clip;
  isSelected: boolean;
  isHovered: boolean;
  sourceKind?: string;
  onMouseDown: (e: React.MouseEvent, clip: Clip) => void;
  onResizeStart: (e: React.MouseEvent, clip: Clip, side: 'left' | 'right') => void;
  onSplit?: (clip: Clip) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick?: (e: React.MouseEvent) => void;
  beatWidth: number;
}

function getClipColorClass(sourceKind: string | undefined): string {
  if (sourceKind === 'sampler' || sourceKind === 'drumPad') return 'arrangement-clip-leaf';
  if (sourceKind === 'oscillator' || sourceKind === 'noise') return 'arrangement-clip-moss';
  return 'arrangement-clip-ember';
}

export function ClipLane({
  clip,
  isSelected,
  isHovered,
  sourceKind,
  onMouseDown,
  onResizeStart,
  onSplit,
  onMouseEnter,
  onMouseLeave,
  onClick,
  beatWidth,
}: ClipLaneProps) {
  const safeLength = Number.isFinite(clip.lengthBeats) && clip.lengthBeats > 0 ? clip.lengthBeats : 1;
  const safeStart = Number.isFinite(clip.startBeat) ? clip.startBeat : 0;
  const clipWidth = Math.max(safeLength * beatWidth, 20);

  const colorClass = getClipColorClass(sourceKind);

  const handleSplitClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSplit?.(clip);
    },
    [clip, onSplit]
  );

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, clip)}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`arrangement-clip ${colorClass} ${isSelected ? 'arrangement-clip-selected' : ''} ${isHovered ? 'arrangement-clip-hover' : ''}`}
      style={{
        left: safeStart * beatWidth,
        top: 4,
        width: clipWidth,
        height: 32,
      }}
    >
      {clip.assetId && (
        <div className="arrangement-clip-waveform">
          <ClipWaveform assetId={clip.assetId} width={clipWidth} height={32} />
        </div>
      )}

      <div className="arrangement-clip-label">
        {clip.assetId ? clip.assetId.slice(0, 10) : clip.id.slice(0, 8)}
        {clip.loop && <span className="arrangement-clip-loop">loop</span>}
      </div>

      {/* Resize handles */}
      {onResizeStart && (
        <>
          <div
            className="arrangement-clip-handle arrangement-clip-handle-left"
            onMouseDown={(e) => onResizeStart(e, clip, 'left')}
          />
          <div
            className="arrangement-clip-handle arrangement-clip-handle-right"
            onMouseDown={(e) => onResizeStart(e, clip, 'right')}
          />
        </>
      )}

      {/* Split button */}
      {isSelected && onSplit && (
        <button
          className="arrangement-clip-split-btn"
          onClick={handleSplitClick}
          title="Split clip at midpoint"
        >
          <Scissors size={10} />
        </button>
      )}
    </div>
  );
}
