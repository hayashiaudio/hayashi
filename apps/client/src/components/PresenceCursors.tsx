import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useProjectStore } from '@/stores/projectStore';
import type { UserPresence } from '@/types/project';

const CURSOR_COLORS = [
  '#ed922f',
  '#8fb13a',
  '#6a9bcc',
  '#d97757',
  '#6f7b5d',
  '#f6df9f',
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

const PresenceCursors = memo(function PresenceCursorsComponent() {
  const { screenToFlowPosition } = useReactFlow();
  const broadcastCursor = useProjectStore((s) => s.broadcastCursor);
  const collaborators = useProjectStore((s) => s.collaborators);
  const localUser = useProjectStore((s) => s.user);
  const containerRef = useRef<HTMLDivElement>(null);

  const [remoteCursors, setRemoteCursors] = useState<UserPresence[]>([]);

  /* Track remote cursors (excluding self) */
  useEffect(() => {
    const others = collaborators.filter((c) => c.id !== localUser?.id && c.cursor);
    setRemoteCursors(others);
  }, [collaborators, localUser?.id]);

  /* Broadcast local cursor */
  const rafRef = useRef(0);
  const lastSentRef = useRef({ x: 0, y: 0 });

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!broadcastCursor) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        /* Throttle: only broadcast if moved > 4px */
        const dx = pos.x - lastSentRef.current.x;
        const dy = pos.y - lastSentRef.current.y;
        if (dx * dx + dy * dy > 16) {
          lastSentRef.current = pos;
          broadcastCursor(pos.x, pos.y);
        }
      });
    },
    [broadcastCursor, screenToFlowPosition]
  );

  useEffect(() => {
    const el = containerRef.current?.closest('.react-flow') as HTMLElement | null;
    if (!el) return;
    const onMove = (e: Event) => handleMouseMove(e as unknown as MouseEvent);
    el.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      el.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  if (remoteCursors.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {remoteCursors.map((person) => {
        const color = person.color || getUserColor(person.id);
        const x = person.cursor?.x ?? 0;
        const y = person.cursor?.y ?? 0;

        return (
          <div
            key={person.id}
            className="hayashi-remote-cursor"
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: 'translate(-2px, -2px)',
              transition: 'left 80ms linear, top 80ms linear',
              zIndex: 30,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ filter: `drop-shadow(0 2px 4px ${color}66)` }}>
              <path
                d="M2 2L8 20L11.5 13.5L18 17L2 2Z"
                fill={color}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <div
              className="hayashi-remote-cursor-badge"
              style={{
                position: 'absolute',
                left: 14,
                top: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px 2px 2px',
                borderRadius: 999,
                background: color,
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: `0 2px 8px ${color}44`,
              }}
            >
              <img
                src={person.avatarUrl ?? 'https://cdn.discordapp.com/embed/avatars/0.png'}
                alt={person.name}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.5)',
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}
              >
                {person.name}
              </span>
            </div>

            {person.focus?.nodeId && (
              <div
                className="hayashi-remote-focus-ring"
                style={{
                  position: 'absolute',
                  left: -40,
                  top: -40,
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  border: `1.5px solid ${color}`,
                  opacity: 0.35,
                  animation: 'hayashi-pulse 2s ease-in-out infinite',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});

export default PresenceCursors;
