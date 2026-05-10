import { useProjectStore } from '@/stores/projectStore';
import { Headphones, Radio, MousePointer2, Hash } from 'lucide-react';

/* ── Mini Presence Pips (stacked avatars like Figma) ── */

function AvatarStack({ users }: { users: import('@/types/project').UserPresence[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
      {users.slice(0, 5).map((u, i) => (
        <img
          key={u.id}
          src={u.avatarUrl ?? 'https://cdn.discordapp.com/embed/avatars/0.png'}
          alt={u.name}
          title={u.name}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `2px solid ${u.color || '#10261d'}`,
            boxShadow: `0 0 0 2px #faf9f5, 0 0 12px ${u.color || '#ed922f'}44`,
            marginLeft: i > 0 ? -10 : 0,
            zIndex: users.length - i,
            transition: 'transform 160ms ease',
            objectFit: 'cover',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = 'scale(1.15) translateY(-2px)'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = ''; }}
        />
      ))}
      {users.length > 5 && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#10261d',
            color: '#faf9f5',
            border: '2px solid #faf9f5',
            marginLeft: -10,
            display: 'grid',
            placeItems: 'center',
            fontSize: 10,
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 600,
          }}
        >
          +{users.length - 5}
        </div>
      )}
    </div>
  );
}

/* ── Activity row for a single collaborator ── */

function PresenceRow({ person, isLocal = false }: { person: import('@/types/project').UserPresence; isLocal?: boolean }) {
  const color = person.color || '#ed922f';
  const isActive = Boolean(person.cursor || person.focus);
  const activityLabel = person.focus?.nodeId
    ? `On ${person.focus.nodeId.slice(0, 12)}`
    : person.cursor
      ? 'Exploring canvas'
      : person.status || 'Listening';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 10,
        background: isActive ? `${color}10` : 'transparent',
        border: `1px solid ${isActive ? `${color}22` : 'transparent'}`,
        transition: 'background 140ms ease, border-color 140ms ease',
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <img
          src={person.avatarUrl ?? 'https://cdn.discordapp.com/embed/avatars/0.png'}
          alt={person.name}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            boxShadow: `0 0 0 2px #faf9f5`,
            objectFit: 'cover',
          }}
        />
        {isActive && (
          <span
            style={{
              position: 'absolute',
              bottom: -1,
              right: -1,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: color,
              border: '2px solid #faf9f5',
              boxShadow: `0 0 6px ${color}`,
            }}
          />
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong
            style={{
              display: 'block',
              fontFamily: "'Poppins', Arial, sans-serif",
              fontSize: '0.78rem',
              color: '#10261d',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {person.name}
          </strong>
          {isLocal && (
            <span
              style={{
                fontSize: '0.6rem',
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'rgba(16,38,29,0.5)',
                background: 'rgba(16,38,29,0.06)',
                padding: '1px 5px',
                borderRadius: 4,
              }}
            >
              You
            </span>
          )}
        </div>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.64rem',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.04em',
            color: isActive ? color : 'rgba(16,38,29,0.45)',
            whiteSpace: 'nowrap',
          }}
        >
          {person.focus?.nodeId ? <Hash size={10} /> : <MousePointer2 size={10} />}
          {activityLabel}
        </span>
      </div>
    </div>
  );
}

/* ── Main component ── */

export function RoomPresenceRail() {
  const collaborators = useProjectStore((s) => s.collaborators);
  const localUser = useProjectStore((s) => s.user);

  const others = collaborators.filter((c) => c.id !== localUser?.id);

  /* Build a local presence entry if user exists but isn't in collaborators yet */
  const localPresence: import('@/types/project').UserPresence | null = localUser
    ? collaborators.find((c) => c.id === localUser.id) ?? {
        id: localUser.id,
        name: localUser.username,
        avatarUrl: localUser.avatar ?? undefined,
        color: stringToColor(localUser.id),
      }
    : null;

  const displayList = localPresence ? [localPresence, ...others] : others;
  const total = displayList.length;

  return (
    <section className="hayashi-mockup-panel hayashi-presence-panel">
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div className="hayashi-panel-title-row" style={{ marginBottom: 10 }}>
          <div>
            <p className="hayashi-mini-label">Presence</p>
            <h2 style={{ fontSize: '1.1rem', lineHeight: 1.1 }}>Room Pulse</h2>
          </div>
          <div className="hayashi-rhythm-chip">
            <Headphones size={13} />
            Local render
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <AvatarStack users={displayList} />
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.62rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(16,38,29,0.45)',
            }}
          >
            {total} {total === 1 ? 'member' : 'members'}
          </span>
        </div>
      </div>

      {/* Active users list */}
      <div style={{ display: 'grid', gap: 4, minHeight: 0 }}>
        {displayList.length === 0 && (
          <div
            style={{
              padding: '14px 10px',
              borderRadius: 10,
              background: 'rgba(16,38,29,0.03)',
              textAlign: 'center',
            }}
          >
            <Radio size={18} style={{ color: 'rgba(16,38,29,0.25)', margin: '0 auto 6px' }} />
            <p
              style={{
                margin: 0,
                fontSize: '0.78rem',
                color: 'rgba(16,38,29,0.5)',
              }}
            >
              Waiting for collaborators…
            </p>
          </div>
        )}

        {displayList.map((person) => (
          <PresenceRow key={person.id} person={person} isLocal={person.id === localUser?.id} />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 10,
          borderTop: '1px solid rgba(16,38,29,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: '0.62rem',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(16,38,29,0.45)',
          }}
        >
          Everyone hears local render
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <span
              key={i}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#8fb13a',
                opacity: 0.4 + i * 0.3,
                boxShadow: i === 2 ? '0 0 6px rgba(143,177,58,0.5)' : undefined,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function stringToColor(str: string): string {
  const colors = ['#ed922f', '#8fb13a', '#6a9bcc', '#d97757', '#6f7b5d', '#f6df9f'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
