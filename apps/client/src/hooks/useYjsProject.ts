import { useEffect, useRef, useCallback, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useProjectStore } from '@/stores/projectStore';
import { getWsUrl, IS_LOCAL_DEV, SERVER_BASE_URL } from '@/lib/constants';
import type { DiscordParticipant } from './useDiscordSdk';
import { createRealtimeSnapshot, setHasRemoteRealtimeState, type RealtimeProjectSnapshot } from '@/lib/projectSync';

const SNAPSHOT_KEY = 'snapshot';
const LOCAL_ORIGIN = 'hayashi-local-sync';

function encodeSnapshot(snapshot: RealtimeProjectSnapshot): string {
  return JSON.stringify(snapshot);
}

function decodeSnapshot(raw: string | null | undefined): RealtimeProjectSnapshot | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RealtimeProjectSnapshot;
  } catch {
    return null;
  }
}

export function useYjsProject(
  channelId: string | null,
  projectId: string | null,
  discordParticipants: DiscordParticipant[] = []
) {
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const projectMapRef = useRef<Y.Map<string> | null>(null);
  const syncReadyRef = useRef(false);
  const suppressStoreSyncRef = useRef(false);
  const lastSerializedRef = useRef('');

  const [collabReady, setCollabReady] = useState(false);
  const [remoteStateLoaded, setRemoteStateLoaded] = useState(false);

  const setCollaborators = useProjectStore((s) => s.setCollaborators);
  const setBroadcastCursor = useProjectStore((s) => s.setBroadcastCursor);
  const setBroadcastFocus = useProjectStore((s) => s.setBroadcastFocus);
  const user = useProjectStore((s) => s.user);

  const participantsRef = useRef(discordParticipants);
  participantsRef.current = discordParticipants;

  const applyRealtimeSnapshot = useCallback((snapshot: RealtimeProjectSnapshot) => {
    suppressStoreSyncRef.current = true;
    try {
      const state = useProjectStore.getState();
      state.setProjectTitle(snapshot.projectTitle);
      state.updateLocalTransport(snapshot.localTransport);
      state.setNodes(snapshot.nodes ?? {});
      state.setEdges(snapshot.edges ?? {});
      state.setAssets(snapshot.assets ?? {});
      state.setClips(snapshot.clips ?? {});
      state.setTracks(snapshot.tracks ?? {});
    } finally {
      suppressStoreSyncRef.current = false;
    }
  }, []);

  /* ── Merge Yjs awareness with Discord participants ── */
  const mergeCollaborators = useCallback(
    (yjsStates: Record<string, unknown>[]) => {
      const participants = participantsRef.current;

      const discordMap = new Map<string, DiscordParticipant>();
      for (const p of participants) {
        discordMap.set(p.id, p);
      }

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

    setCollabReady(false);
    setRemoteStateLoaded(false);
    setHasRemoteRealtimeState(false);
    syncReadyRef.current = false;
    lastSerializedRef.current = '';

    const ydoc = new Y.Doc();
    const wsUrl = getWsUrl();
    const provider = new WebsocketProvider(wsUrl, roomName, ydoc);
    const projectMap = ydoc.getMap<string>('projectState');

    provider.on('status', (event: { status: string }) => {
      console.log('[Hayashi] Yjs project status:', event.status, 'room:', roomName);
    });

    const handleAwarenessChange = () => {
      const states = Array.from(provider.awareness.getStates().values());
      mergeCollaborators(states);
    };

    const handleProjectStateChange = (_event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
      const snapshot = decodeSnapshot(projectMap.get(SNAPSHOT_KEY));
      if (!snapshot) return;
      lastSerializedRef.current = encodeSnapshot(snapshot);

      if (transaction.origin === LOCAL_ORIGIN) return;

      applyRealtimeSnapshot(snapshot);
      setRemoteStateLoaded(true);
      setHasRemoteRealtimeState(true);
    };

    provider.awareness.on('change', handleAwarenessChange);
    projectMap.observe(handleProjectStateChange);

    const handleSync = (isSynced: boolean) => {
      if (!isSynced) return;

      const snapshot = decodeSnapshot(projectMap.get(SNAPSHOT_KEY));
      if (snapshot) {
        lastSerializedRef.current = encodeSnapshot(snapshot);
        applyRealtimeSnapshot(snapshot);
        setRemoteStateLoaded(true);
        setHasRemoteRealtimeState(true);
      } else {
        setRemoteStateLoaded(false);
        setHasRemoteRealtimeState(false);
      }

      syncReadyRef.current = true;
      setCollabReady(true);
      handleAwarenessChange();
    };

    provider.on('sync', handleSync);
    handleAwarenessChange();

    providerRef.current = provider;
    ydocRef.current = ydoc;
    projectMapRef.current = projectMap;

    return () => {
      provider.off('sync', handleSync);
      provider.awareness.off('change', handleAwarenessChange);
      projectMap.unobserve(handleProjectStateChange);
      provider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      ydocRef.current = null;
      projectMapRef.current = null;
      syncReadyRef.current = false;
      setCollabReady(false);
      setRemoteStateLoaded(false);
      setHasRemoteRealtimeState(false);
      setBroadcastCursor(null);
      setBroadcastFocus(null);
    };
  }, [channelId, projectId, mergeCollaborators, setBroadcastCursor, setBroadcastFocus, applyRealtimeSnapshot]);

  /* ── Push local project state into Yjs ── */
  useEffect(() => {
    const unsubscribe = useProjectStore.subscribe((state) => {
      const projectMap = projectMapRef.current;
      if (!projectMap || !syncReadyRef.current || suppressStoreSyncRef.current) return;

      const snapshot = createRealtimeSnapshot({
        projectTitle: state.projectTitle,
        localTransport: state.localTransport,
        nodes: state.nodes,
        edges: state.edges,
        assets: state.assets,
        clips: state.clips,
        tracks: state.tracks,
      });
      const serialized = encodeSnapshot(snapshot);
      if (serialized === lastSerializedRef.current) return;

      lastSerializedRef.current = serialized;
      projectMap.doc?.transact(() => {
        projectMap.set(SNAPSHOT_KEY, serialized);
      }, LOCAL_ORIGIN);
    });

    return () => unsubscribe();
  }, []);

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

    const states = Array.from(provider.awareness.getStates().values());
    mergeCollaborators(states);
  }, [user?.id, user?.username, user?.avatar, mergeCollaborators]);

  /* ── Re-merge when Discord participants change ── */
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
  }, [setBroadcastCursor, setBroadcastFocus, collabReady]);

  const broadcastCursor = useCallback((x: number, y: number) => {
    const provider = providerRef.current;
    if (!provider) return;
    provider.awareness.setLocalStateField('cursor', { x, y });
  }, []);

  const broadcastFocus = useCallback((nodeId: string | null, param?: string) => {
    const provider = providerRef.current;
    if (!provider) return;
    provider.awareness.setLocalStateField('focus', { nodeId, param });
  }, []);

  return { broadcastCursor, broadcastFocus, collabReady, remoteStateLoaded };
}

function stringToColor(str: string): string {
  const colors = ['#ed922f', '#8fb13a', '#6a9bcc', '#d97757', '#6f7b5d', '#f6df9f'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
