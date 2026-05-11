import type { CSSProperties } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import type { UserPresence } from '@/types/project';

const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';
const STACK_LIMIT = 7;

function buildDisplayList(collaborators: UserPresence[], localUser: ReturnType<typeof useProjectStore.getState>['user']) {
  const others = collaborators.filter((c) => c.id !== localUser?.id);

  const localPresence: UserPresence | null = localUser
    ? collaborators.find((c) => c.id === localUser.id) ?? {
        id: localUser.id,
        name: localUser.username,
        avatarUrl: localUser.avatar ?? undefined,
        color: stringToColor(localUser.id),
      }
    : null;

  return localPresence ? [localPresence, ...others] : others;
}

export function HeaderPresenceStack() {
  const collaborators = useProjectStore((s) => s.collaborators);
  const localUser = useProjectStore((s) => s.user);

  const displayList = buildDisplayList(collaborators, localUser);
  const visibleUsers = displayList.slice(0, STACK_LIMIT);
  const overflowCount = Math.max(0, displayList.length - STACK_LIMIT);

  return (
    <div
      className="hayashi-header-presence"
      aria-label={`${displayList.length} ${displayList.length === 1 ? 'collaborator' : 'collaborators'} in room`}
    >
      <span className="hayashi-header-presence-copy">
        Presence {displayList.length || 0} online
      </span>
      <div className="hayashi-header-avatar-stack" role="list" aria-hidden="true">
        {visibleUsers.length === 0 ? (
          <span className="hayashi-header-avatar-empty">0</span>
        ) : (
          visibleUsers.map((user, index) => {
            const isTopAvatar = index === visibleUsers.length - 1;

            return (
              <span
                key={user.id}
                className="hayashi-header-avatar"
                role="listitem"
                title={user.name}
                style={
                  {
                    '--avatar-ring': user.color || '#10261d',
                    zIndex: index + 1,
                  } as CSSProperties
                }
              >
                <img src={user.avatarUrl ?? DEFAULT_AVATAR} alt="" />
                {overflowCount > 0 && isTopAvatar ? (
                  <span className="hayashi-header-avatar-overflow">+{overflowCount}</span>
                ) : null}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

function stringToColor(str: string): string {
  const colors = ['#ed922f', '#8fb13a', '#6a9bcc', '#d97757', '#6f7b5d', '#f6df9f'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
