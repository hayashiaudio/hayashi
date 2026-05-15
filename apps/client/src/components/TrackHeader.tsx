import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Volume2, VolumeX, CircleDot, Disc3, Plus, Trash2, SlidersHorizontal } from 'lucide-react';
import type { Track } from '@/types/project';
import type { PatchNode } from '@/types/project';
import { TrackFxChain } from './TrackFxChain';

interface TrackHeaderProps {
  track: Track;
  sourceNode: PatchNode | null;
  assetName?: string;
  fxOpen?: boolean;
  onFxToggle?: () => void;
  onGainChange: (value: number) => void;
  onPanChange: (value: number) => void;
  onMuteToggle: () => void;
  onArmToggle: () => void;
  onPrintClip: () => void;
  onBounceTrack: () => void;
  onRemoveTrack: () => void;
}

const SKIP_AUTO_TRACK_KINDS = new Set(['oscillator', 'noise']);

function getNodeColor(kind: string): string {
  switch (kind) {
    case 'sampler':
    case 'drumPad':
      return '#8fb13a';
    case 'oscillator':
    case 'noise':
      return '#6f7b5d';
    default:
      return '#ed922f';
  }
}

function formatGain(v: number): string {
  return `${Math.round(v * 100)}`;
}
function formatPan(v: number): string {
  return v === 0 ? 'C' : v > 0 ? `R${Math.round(v * 10)}` : `L${Math.round(Math.abs(v) * 10)}`;
}

/* ── Mini rotary knob (smaller version of node-focus knob) ── */
function MiniKnob({
  value,
  min,
  max,
  onChange,
  label,
  title,
  color,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  title: string;
  color?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ y: 0, value: 0 });
  const range = max - min;
  const pct = (value - min) / range;
  const angle = -135 + pct * 270;

  const onDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      startRef.current = { y: clientY, value };
      setDragging(true);
    },
    [value]
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dy = startRef.current.y - clientY;
      const delta = (dy * 0.008) * range;
      const next = Math.min(max, Math.max(min, startRef.current.value + delta));
      onChange(next);
    };
    const onUp = () => setDragging(false);
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
  }, [dragging, min, max, range, onChange]);

  const c = color || '#ed922f';

  return (
    <div
      className="hayashi-mini-knob"
      title={title}
      onMouseDown={onDown}
      onTouchStart={onDown}
      style={{ cursor: dragging ? 'ns-resize' : 'pointer' }}
    >
      <div className="hayashi-mini-knob-dial" style={{ transform: `rotate(${angle}deg)` }}>
        <div className="hayashi-mini-knob-marker" style={{ background: c }} />
      </div>
      <div
        className="hayashi-mini-knob-track"
        style={{
          background: `conic-gradient(from 225deg, ${c}59 0deg, ${c}33 90deg, transparent 90deg, transparent 270deg, ${c}33 270deg, ${c}59 360deg) border-box`,
        }}
      />
      <span className="hayashi-mini-knob-label">{label}</span>
    </div>
  );
}

export function TrackHeader({
  track,
  sourceNode,
  assetName,
  fxOpen = false,
  onFxToggle,
  onGainChange,
  onPanChange,
  onMuteToggle,
  onArmToggle,
  onPrintClip,
  onBounceTrack,
  onRemoveTrack,
}: TrackHeaderProps) {
  const color = sourceNode ? getNodeColor(sourceNode.kind) : 'rgba(245,230,200,0.4)';
  const isContinuous = sourceNode ? SKIP_AUTO_TRACK_KINDS.has(sourceNode.kind) : false;
  const hasFx = (track.fxChain?.length ?? 0) > 0;
  const stableFxChain = useMemo(() => track.fxChain ?? [], [track.fxChain]);

  const handleFxToggle = useCallback(() => {
    onFxToggle?.();
  }, [onFxToggle]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: fxOpen ? 88 : 40,
        minWidth: 0,
        boxSizing: 'border-box',
        transition: 'height 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Top 40px: standard header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: 40,
          padding: '3px 8px',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        {/* Top row: dot + name + kind badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <div
            title={sourceNode?.kind ?? 'Clip lane'}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
              boxShadow: isContinuous ? `0 0 6px ${color}` : 'none',
            }}
          />
          <span
            title={track.name}
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: "'Poppins', Arial, sans-serif",
              fontSize: '0.72rem',
              letterSpacing: '0.02em',
              color: 'rgba(16, 38, 29, 0.9)',
            }}
          >
            {track.name}
          </span>
          {assetName && (
            <span title={assetName} style={{ flexShrink: 0, color: 'rgba(16, 38, 29, 0.42)' }}>
              <Disc3 size={10} />
            </span>
          )}
          {isContinuous && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.58rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'rgba(16, 38, 29, 0.45)',
              }}
            >
              {sourceNode?.kind}
            </span>
          )}
          {sourceNode?.kind === 'midiBridge' && (
            <span
              style={{
                flexShrink: 0,
                fontSize: '0.58rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'rgba(212, 140, 46, 0.65)',
              }}
            >
              Synthesis
            </span>
          )}
        </div>

        {/* Bottom row: knobs + buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 0,
            marginTop: 2,
          }}
        >
          <MiniKnob
            value={track.gain ?? 1}
            min={0}
            max={1}
            onChange={onGainChange}
            label={formatGain(track.gain ?? 1)}
            title={`Gain: ${Math.round((track.gain ?? 1) * 100)}%`}
            color={color}
          />
          <MiniKnob
            value={track.pan ?? 0}
            min={-1}
            max={1}
            onChange={onPanChange}
            label={formatPan(track.pan ?? 0)}
            title={`Pan: ${track.pan ?? 0}`}
            color={color}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              className={`hayashi-workstation-toggle ${track.muted ? 'is-muted' : ''}`}
              onClick={onMuteToggle}
              type="button"
              title={track.muted ? 'Unmute track' : 'Mute track'}
              style={{ width: 18, height: 18, padding: 0, justifyContent: 'center' }}
            >
              {track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
            </button>

            <button
              className={`hayashi-workstation-toggle ${track.armed ? 'is-armed' : ''}`}
              onClick={onArmToggle}
              type="button"
              title={track.armed ? 'Disarm recording lane' : 'Arm recording lane'}
              style={{ width: 18, height: 18, padding: 0, justifyContent: 'center' }}
            >
              <CircleDot size={10} />
            </button>

            {/* FX button */}
            <button
              className={`hayashi-workstation-toggle ${fxOpen ? 'is-active' : ''}`}
              onClick={handleFxToggle}
              type="button"
              title={fxOpen ? 'Close FX chain' : 'Open FX chain'}
              style={{ width: 18, height: 18, padding: 0, justifyContent: 'center', position: 'relative' }}
            >
              <SlidersHorizontal size={10} />
              {hasFx && !fxOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#d48c2e',
                  }}
                />
              )}
            </button>

            {isContinuous && (
              <button
                className="hayashi-workstation-toggle is-print"
                onClick={onBounceTrack}
                type="button"
                title="Bounce continuous source to clip"
                style={{ width: 18, height: 18, padding: 0, justifyContent: 'center' }}
              >
                <Disc3 size={10} />
              </button>
            )}

            {sourceNode && (
              <button
                className="hayashi-workstation-toggle is-print"
                onClick={onPrintClip}
                type="button"
                title="Print a clip at the playhead"
                style={{ width: 18, height: 18, padding: 0, justifyContent: 'center' }}
              >
                <Plus size={10} />
              </button>
            )}

            <button
              className="hayashi-workstation-toggle"
              onClick={onRemoveTrack}
              type="button"
              title="Remove track"
              style={{ width: 18, height: 18, padding: 0, justifyContent: 'center', color: 'rgba(165,67,67,0.75)' }}
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      </div>

      {/* FX chain row (48px, only when open) */}
      {fxOpen && (
        <TrackFxChain
          trackId={track.id}
          fxChain={stableFxChain}
          onClose={() => onFxToggle?.()}
        />
      )}
    </div>
  );
}
