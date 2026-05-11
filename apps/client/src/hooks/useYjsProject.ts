import { useEffect, useRef, useCallback, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useProjectStore } from '@/stores/projectStore';
import { getWsUrl, IS_LOCAL_DEV, SERVER_BASE_URL } from '@/lib/constants';
import type { DiscordParticipant } from './useDiscordSdk';
import { createRealtimeSnapshot, setHasRemoteRealtimeState, type RealtimeProjectSnapshot } from '@/lib/projectSync';
import type { PatchNode, PatchEdge, Clip, Track, Asset, TransportState } from '@/types/project';

const SNAPSHOT_KEY = 'snapshot';
const LOCAL_ORIGIN = 'hayashi-local-sync';

function encodeSnapshot(snapshot: RealtimeProjectSnapshot): string {
  return JSON.stringify(snapshot);
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

  function ymapToObject<T>(ymap: Y.Map<unknown>): T {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of ymap.entries()) {
      obj[key] = value;
    }
    return obj as T;
  }

  function setupIncomingEntitySync(
    rootMap: Y.Map<Y.Map<unknown>>,
    entityType: 'node' | 'edge' | 'clip' | 'track' | 'asset',
    suppressRef: React.MutableRefObject<boolean>
  ): () => void {
    const handleChange = (events: Y.YEvent<any>[], transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;

      suppressRef.current = true;
      try {
        const store = useProjectStore.getState();

        for (const event of events) {
          const target = event.target as Y.Map<unknown>;

          if (target === rootMap) {
            // Root map change: entity added or removed
            for (const [id, change] of (event as Y.YMapEvent<unknown>).changes.keys.entries()) {
              if (change.action === 'delete') {
                switch (entityType) {
                  case 'node': store.removeNode(id); break;
                  case 'edge': store.removeEdge(id); break;
                  case 'clip': store.removeClip(id); break;
                  case 'track': store.removeTrack(id); break;
                  case 'asset': store.removeAsset(id); break;
                }
              } else {
                const entityMap = rootMap.get(id);
                if (!entityMap) continue;
                const entity = ymapToObject(entityMap);
                switch (entityType) {
                  case 'node': store.addNode(entity as PatchNode); break;
                  case 'edge': store.addEdge(entity as PatchEdge); break;
                  case 'clip': store.addClip(entity as Clip); break;
                  case 'track': store.addTrack(entity as Track); break;
                  case 'asset': store.addAsset(entity as Asset); break;
                }
              }
            }
          } else {
            // Nested map change: property updated on existing entity
            const id = event.path[0] as string;
            const entityMap = rootMap.get(id);
            if (entityMap) {
              const entity = ymapToObject(entityMap);
              switch (entityType) {
                case 'node': store.setNodes({ ...store.nodes, [id]: entity as PatchNode }); break;
                case 'edge': store.setEdges({ ...store.edges, [id]: entity as PatchEdge }); break;
                case 'clip': store.setClips({ ...store.clips, [id]: entity as Clip }); break;
                case 'track': store.setTracks({ ...store.tracks, [id]: entity as Track }); break;
                case 'asset': store.setAssets({ ...store.assets, [id]: entity as Asset }); break;
              }
            }
          }
        }
      } finally {
        suppressRef.current = false;
      }
    };

    rootMap.observeDeep(handleChange);
    return () => rootMap.unobserveDeep(handleChange);
  }

  /* ── Create / destroy provider when room identity changes ── */
  useEffect(() => {
    if (!channelId || !projectId) return;
    if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) return;
    const roomName = `project:${channelId}:${projectId}`;

    setCollabReady(false);
    setRemoteStateLoaded(false);
    setHasRemoteRealtimeState(false);
    syncReadyRef.current = false;

    const ydoc = new Y.Doc();
    const wsUrl = getWsUrl();
    const provider = new WebsocketProvider(wsUrl, roomName, ydoc);
    const projectMeta = ydoc.getMap<unknown>('projectMeta');
    const nodesMap = ydoc.getMap<Y.Map<unknown>>('nodes');
    const edgesMap = ydoc.getMap<Y.Map<unknown>>('edges');
    const clipsMap = ydoc.getMap<Y.Map<unknown>>('clips');
    const tracksMap = ydoc.getMap<Y.Map<unknown>>('tracks');
    const assetsMap = ydoc.getMap<Y.Map<unknown>>('assets');

    provider.on('status', (event: { status: string }) => {
      console.log('[Hayashi] Yjs project status:', event.status, 'room:', roomName);
    });

    const handleAwarenessChange = () => {
      const states = Array.from(provider.awareness.getStates().values());
      mergeCollaborators(states);
    };

    provider.awareness.on('change', handleAwarenessChange);

    const handleSync = (isSynced: boolean) => {
      if (!isSynced) return;

      const hasRemote =
        nodesMap.size > 0 ||
        edgesMap.size > 0 ||
        clipsMap.size > 0 ||
        tracksMap.size > 0 ||
        assetsMap.size > 0 ||
        projectMeta.size > 0;

      if (hasRemote) {
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

    const unsubNodes = setupIncomingEntitySync(nodesMap, 'node', suppressStoreSyncRef);
    const unsubEdges = setupIncomingEntitySync(edgesMap, 'edge', suppressStoreSyncRef);
    const unsubClips = setupIncomingEntitySync(clipsMap, 'clip', suppressStoreSyncRef);
    const unsubTracks = setupIncomingEntitySync(tracksMap, 'track', suppressStoreSyncRef);
    const unsubAssets = setupIncomingEntitySync(assetsMap, 'asset', suppressStoreSyncRef);

    const unsubMeta = (() => {
      const handleMetaChange = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
        if (transaction.origin === LOCAL_ORIGIN) return;
        suppressStoreSyncRef.current = true;
        try {
          const store = useProjectStore.getState();
          const title = projectMeta.get('title') as string | undefined;
          const transport: Partial<TransportState> = {};
          if (projectMeta.has('playing')) transport.playing = projectMeta.get('playing') as boolean;
          if (projectMeta.has('bpm')) transport.bpm = projectMeta.get('bpm') as number;
          if (projectMeta.has('beatOffset')) transport.beatOffset = projectMeta.get('beatOffset') as number;
          if (projectMeta.has('timeSignature')) transport.timeSignature = projectMeta.get('timeSignature') as [number, number];
          if (projectMeta.has('key')) transport.key = projectMeta.get('key') as string;
          if (projectMeta.has('scene')) transport.scene = projectMeta.get('scene') as string;

          if (title !== undefined && title !== store.projectTitle) {
            store.setProjectTitle(title);
          }
          if (Object.keys(transport).length > 0) {
            store.updateLocalTransport(transport);
          }
        } finally {
          suppressStoreSyncRef.current = false;
        }
      };
      projectMeta.observe(handleMetaChange);
      return () => projectMeta.unobserve(handleMetaChange);
    })();

    providerRef.current = provider;
    ydocRef.current = ydoc;

    return () => {
      provider.awareness.off('change', handleAwarenessChange);
      provider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      ydocRef.current = null;
      syncReadyRef.current = false;
      unsubNodes();
      unsubEdges();
      unsubClips();
      unsubTracks();
      unsubAssets();
      unsubMeta();
      setCollabReady(false);
      setRemoteStateLoaded(false);
      setHasRemoteRealtimeState(false);
      setBroadcastCursor(null);
      setBroadcastFocus(null);
    };
  }, [channelId, projectId, mergeCollaborators, setBroadcastCursor, setBroadcastFocus]);

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
