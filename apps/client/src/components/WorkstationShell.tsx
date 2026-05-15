import { Play, Square, CircleDot, Plus } from 'lucide-react';
import type { TransportState } from '@/types/project';

interface WorkstationShellProps {
  nodeId: string;
  transport: TransportState;
  recording: boolean;
  trackCount: number;
  clipCount: number;
  onTogglePlay: () => void;
  onToggleRecord: () => void;
  onAddTrack: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}

export function WorkstationShell({
  nodeId,
  transport,
  recording,
  trackCount,
  clipCount,
  onTogglePlay,
  onToggleRecord,
  onAddTrack,
  onClose,
  children,
}: WorkstationShellProps) {
  return (
    <div
      className="hayashi-surface"
      style={{
        width: 'min(1100px, 94vw)',
        height: 'min(720px, 85vh)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="hayashi-panel-header" style={{ flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <span className="hayashi-kicker-app">Workstation</span>
          <strong className="hayashi-title-display" style={{ fontSize: '1rem' }}>
            {nodeId}
          </strong>
        </div>
        <div className="flex items-center gap-2">
          <button className="hayashi-daw-tbtn" onClick={onTogglePlay}>
            {transport.playing ? <Square size={14} /> : <Play size={14} />}
          </button>
          <button
            className={`hayashi-daw-tbtn hayashi-daw-tbtn-rec ${recording ? 'is-recording' : ''}`}
            onClick={onToggleRecord}
            type="button"
            title={recording ? 'Stop recording' : 'Start recording'}
          >
            <CircleDot size={14} />
          </button>
          <button className="hayashi-btn-ghost hayashi-button-xs" onClick={onClose}>
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
          <span className="hayashi-status-pill hayashi-status-pill-bpm">{transport.bpm} BPM</span>
          <span className="hayashi-status-pill">{transport.timeSignature[0]}/{transport.timeSignature[1]}</span>
          <span className="hayashi-status-pill">{transport.key}</span>
          <span className="hayashi-status-pill">
            {trackCount} {trackCount === 1 ? 'track' : 'tracks'}
          </span>
          <span className="hayashi-status-pill">
            {clipCount} {clipCount === 1 ? 'clip' : 'clips'}
          </span>
        </div>
        <span
          style={{
            fontSize: '0.68rem',
            color: 'var(--hayashi-text-dim)',
            letterSpacing: '0.02em',
          }}
        >
          {trackCount > 0 ? 'Scroll or drag to navigate' : 'Add tracks to start'}
        </span>
        <button className="hayashi-btn-ghost hayashi-button-xs ml-auto" onClick={onAddTrack}>
          <Plus size={12} /> Add Track
        </button>
      </div>

      {children}
    </div>
  );
}
