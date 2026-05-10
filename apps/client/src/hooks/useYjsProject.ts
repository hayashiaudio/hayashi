import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useProjectStore } from '@/stores/projectStore';
import { getWsUrl, IS_LOCAL_DEV, SERVER_BASE_URL } from '@/lib/constants';
import type { DiscordParticipant } from './useDiscordSdk';

export function useYjsProject(
  channelId: string | null,
  projectId: string | null,
  discordParticipants: DiscordParticipant[] = []
) {
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const setCollaborators = useProjectStore((s) => s.setCollaborators);
  const setBroadcastCursor = useProjectStore((s) => s.setBroadcastCursor);
  const setBroadcastFocus = useProjectStore((s) => s.setBroadcastFocus);
  const user = useProjectStore((s) => s.user);

  const participantsRef = useRef(discordParticipants);
  participantsRef.current = discordParticipants;

  /* ── Merge Yjs awareness with Discord participants ── */
  const mergeCollaborators = useCallback(
    (yjsStates: Record<string, unknown>[]) => {
      const participants = participantsRef.current;

      // Build map of Discord participants by id
      const discordMap = new Map<string, DiscordParticipant>();
      for (const p of participants) {
        discordMap.set(p.id, p);
      }

      // Build map of Yjs awareness states by id
      const yjsMap = new Map<string, import('@/types/project').UserPresence>();
      for (const state of yjsStates) {
        const u = state.user as import('@/types/project').UserPresence | undefined;
        if (!u) continue;
        yjsMap.set(u.id, {
          ...u,
          cursor: state.cursor as { x: number; y: number } | undefined,
          focus: state.focus as { nodeId?: string; param?: string } | undefined,
        });
      }

      // Merge: start with Discord participants, overlay Yjs cursor/focus data
      const merged: import('@/types/project').UserPresence[] = [];
      const seen = new Set<string>();

      for (const p of participants) {
        const yjs = yjsMap.get(p.id);
        merged.push({
          id: p.id,
          name: p.global_name || p.nickname || p.username,
          avatarUrl: p.avatar
            ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png`
            : undefined,
          color: yjs?.color || stringToColor(p.id),
          cursor: yjs?.cursor,
          focus: yjs?.focus,
          status: yjs?.status,
        });
        seen.add(p.id);
      }

      // Add any Yjs-only participants (shouldn't normally happen)
      for (const [id, yjs] of yjsMap) {
        if (seen.has(id)) continue;
        merged.push(yjs);
      }

      setCollaborators(merged);
    },
    [setCollaborators]
  );

  /* ── Create / destroy provider when room identity changes ── */
  useEffect(() => {
    if (!channelId || !projectId) return;
    if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) return;
    const roomName = `project:${channelId}:${projectId}`;

    const ydoc = new Y.Doc();
    const wsUrl = getWsUrl();
    const provider = new WebsocketProvider(wsUrl, roomName, ydoc);

    provider.on('status', (event: { status: string }) => {
      console.log('[Hayashi] Yjs project status:', event.status, 'room:', roomName);
    });

    const handleAwarenessChange = () => {
      const states = Array.from(provider.awareness.getStates().values());
      mergeCollaborators(states);
    };

    provider.awareness.on('change', handleAwarenessChange);
    handleAwarenessChange();

    const project = ydoc.getMap('project');
    const scenes = ydoc.getArray('scenes');

    if (project.size === 0) {
      project.set('title', 'Untitled Jam');
      project.set('bpm', 128);
      project.set('timeSignature', [4, 4]);
      project.set('key', 'D minor');
      project.set('scale', 'minor');
      project.set('createdAt', Date.now());
      scenes.push(['A']);
    }

    providerRef.current = provider;
    ydocRef.current = ydoc;

    return () => {
      provider.awareness.off('change', handleAwarenessChange);
      provider.destroy();
      ydoc.destroy();
      setBroadcastCursor(null);
      setBroadcastFocus(null);
    };
  }, [channelId, projectId, mergeCollaborators, setBroadcastCursor, setBroadcastFocus]);

  /* ── Update local awareness user info when user object changes ── */
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || !user) return;

    provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.username,
      avatarUrl: user.avatar,
      color: stringToColor(user.id),
    });

    /* Force re-merge so our own component sees the update immediately */
    const states = Array.from(provider.awareness.getStates().values());
    mergeCollaborators(states);
  }, [user?.id, user?.username, user?.avatar, mergeCollaborators]);

  /* ── Re-merge when Discord participants change (from outside Yjs) ── */
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return;
    const states = Array.from(provider.awareness.getStates().values());
    mergeCollaborators(states);
  }, [discordParticipants, mergeCollaborators]);

  /* ── Keep store broadcast functions pointed at current provider ── */
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider) return;

    setBroadcastCursor((x: number, y: number) => {
      provider.awareness.setLocalStateField('cursor', { x, y });
    });
    setBroadcastFocus((nodeId: string | null, param?: string) => {
      provider.awareness.setLocalStateField('focus', { nodeId, param });
    });
  }, [setBroadcastCursor, setBroadcastFocus]);

  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      const provider = providerRef.current;
      if (!provider) return;
      provider.awareness.setLocalStateField('cursor', { x, y });
    },
    []
  );

  const broadcastFocus = useCallback(
    (nodeId: string | null, param?: string) => {
      const provider = providerRef.current;
      if (!provider) return;
      provider.awareness.setLocalStateField('focus', { nodeId, param });
    },
    []
  );

  return { broadcastCursor, broadcastFocus };
}

function stringToColor(str: string): string {
  const colors = ['#ed922f', '#8fb13a', '#6a9bcc', '#d97757', '#6f7b5d', '#f6df9f'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
