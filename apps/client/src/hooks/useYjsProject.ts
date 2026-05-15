import { useEffect, useRef, useCallback, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useProjectStore } from '@/stores/projectStore';
import { getWsUrl, IS_LOCAL_DEV, SERVER_BASE_URL } from '@/lib/constants';
import type { DiscordParticipant } from './useDiscordSdk';
import { setHasRemoteRealtimeState } from '@/lib/projectSync';
import { fetchMissingSample } from '@/samples/sync';
import type { PatchNode, PatchEdge, Clip, Track, Asset, TransportState } from '@/types/project';

const LOCAL_ORIGIN = 'hayashi-local-sync';

export function diffRecord<T>(
  prev: Record<string, T>,
  next: Record<string, T>
): { added: Record<string, T>; removed: string[]; updated: Array<{ id: string; changes: Partial<T> }> } {
  const added: Record<string, T> = {};
  const removed: string[] = [];
  const updated: Array<{ id: string; changes: Partial<T> }> = [];

  for (const [id, entity] of Object.entries(next)) {
    if (!prev[id]) {
      added[id] = entity;
    } else {
      const changes: Partial<T> = {};
      const entityRecord = entity as Record<string, unknown>;
      const prevRecord = prev[id] as Record<string, unknown>;
      for (const key of Object.keys(entityRecord)) {
        if (JSON.stringify(prevRecord[key]) !== JSON.stringify(entityRecord[key])) {
          (changes as Record<string, unknown>)[key] = entityRecord[key];
        }
      }
      if (Object.keys(changes).length > 0) {
        updated.push({ id, changes });
      }
    }
  }

  for (const id of Object.keys(prev)) {
    if (!next[id]) removed.push(id);
  }

  return { added, removed, updated };
}

export function useYjsProject(
  instanceId: string | null,
  projectId: string | null,
  discordParticipants: DiscordParticipant[] = []
) {
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const syncReadyRef = useRef(false);
  const suppressStoreSyncRef = useRef(false);

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
        if (!yjs) continue; // only show people actually in the Yjs room
        merged.push({
          id: p.id,
          name: p.global_name || p.nickname || p.username,
          avatarUrl: p.avatar
            ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png`
            : undefined,
          color: yjs.color || stringToColor(p.id),
          cursor: yjs.cursor,
          focus: yjs.focus,
          status: yjs.status,
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
                  case 'asset':
                    store.addAsset(entity as Asset);
                    {
                      const a = entity as Asset;
                      if (a.storageUrl) {
                        fetchMissingSample(a.id, a.storageUrl, {
                          name: a.name,
                          mimeType: a.mimeType,
                          duration: a.durationSeconds,
                          sampleRate: a.sampleRate,
                          channels: a.channels,
                          waveformPeaks: a.waveformPeaks,
                        }).catch(() => {});
                      }
                    }
                    break;
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
                case 'asset':
                  store.setAssets({ ...store.assets, [id]: entity as Asset });
                  {
                    const a = entity as Asset;
                    if (a.storageUrl) {
                      fetchMissingSample(a.id, a.storageUrl, {
                        name: a.name,
                        mimeType: a.mimeType,
                        duration: a.durationSeconds,
                        sampleRate: a.sampleRate,
                        channels: a.channels,
                        waveformPeaks: a.waveformPeaks,
                      }).catch(() => {});
                    }
                  }
                  break;
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
    if (!instanceId || !projectId) return;
    if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) return;
    const roomName = `project:${instanceId}:${projectId}`;

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

        // Initial sync: read existing Yjs content into Zustand.
        // observeDeep only fires for future changes, so we must hydrate
        // from the current Yjs state on every fresh connection.
        suppressStoreSyncRef.current = true;
        try {
          const store = useProjectStore.getState();

          if (nodesMap.size > 0) {
            const nodes: Record<string, PatchNode> = {};
            for (const [id, nodeMap] of nodesMap.entries()) {
              nodes[id] = ymapToObject(nodeMap) as PatchNode;
            }
            store.setNodes(nodes);
          }

          if (edgesMap.size > 0) {
            const edges: Record<string, PatchEdge> = {};
            for (const [id, edgeMap] of edgesMap.entries()) {
              edges[id] = ymapToObject(edgeMap) as PatchEdge;
            }
            store.setEdges(edges);
          }

          if (clipsMap.size > 0) {
            const clips: Record<string, Clip> = {};
            for (const [id, clipMap] of clipsMap.entries()) {
              clips[id] = ymapToObject(clipMap) as Clip;
            }
            store.setClips(clips);
          }

          if (tracksMap.size > 0) {
            const tracks: Record<string, Track> = {};
            for (const [id, trackMap] of tracksMap.entries()) {
              tracks[id] = ymapToObject(trackMap) as Track;
            }
            store.setTracks(tracks);
          }

          if (assetsMap.size > 0) {
            const assets: Record<string, Asset> = {};
            for (const [id, assetMap] of assetsMap.entries()) {
              assets[id] = ymapToObject(assetMap) as Asset;
            }
            store.setAssets(assets);
          }

          if (projectMeta.size > 0) {
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
          }
        } finally {
          suppressStoreSyncRef.current = false;
        }
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
  }, [instanceId, projectId, mergeCollaborators, setBroadcastCursor, setBroadcastFocus]);

  /* ── Outgoing: push local changes into Yjs (granular) ── */
  useEffect(() => {
    let prevState = useProjectStore.getState();

    const unsubscribe = useProjectStore.subscribe((state) => {
      const wasSuppressed = suppressStoreSyncRef.current;
      const ydoc = ydocRef.current;
      if (!ydoc || !syncReadyRef.current) {
        prevState = state;
        return;
      }

      const nodesMap = ydoc.getMap<Y.Map<unknown>>('nodes');
      const edgesMap = ydoc.getMap<Y.Map<unknown>>('edges');
      const clipsMap = ydoc.getMap<Y.Map<unknown>>('clips');
      const tracksMap = ydoc.getMap<Y.Map<unknown>>('tracks');
      const assetsMap = ydoc.getMap<Y.Map<unknown>>('assets');
      const projectMeta = ydoc.getMap<unknown>('projectMeta');

      if (!wasSuppressed) {
        // --- nodes ---
        const nodeDiff = diffRecord(prevState.nodes, state.nodes);
        if (Object.keys(nodeDiff.added).length > 0 || nodeDiff.removed.length > 0 || nodeDiff.updated.length > 0) {
          ydoc.transact(() => {
            for (const [id, node] of Object.entries(nodeDiff.added)) {
              const nodeMap = new Y.Map<unknown>();
              for (const [k, v] of Object.entries(node)) {
                nodeMap.set(k, v);
              }
              nodesMap.set(id, nodeMap);
            }
            for (const id of nodeDiff.removed) {
              nodesMap.delete(id);
            }
            for (const { id, changes } of nodeDiff.updated) {
              const nodeMap = nodesMap.get(id);
              if (nodeMap) {
                for (const [k, v] of Object.entries(changes)) {
                  nodeMap.set(k, v);
                }
              }
            }
          }, LOCAL_ORIGIN);
        }

        // --- edges ---
        const edgeDiff = diffRecord(prevState.edges, state.edges);
        if (Object.keys(edgeDiff.added).length > 0 || edgeDiff.removed.length > 0 || edgeDiff.updated.length > 0) {
          ydoc.transact(() => {
            for (const [id, edge] of Object.entries(edgeDiff.added)) {
              const edgeMap = new Y.Map<unknown>();
              for (const [k, v] of Object.entries(edge)) {
                edgeMap.set(k, v);
              }
              edgesMap.set(id, edgeMap);
            }
            for (const id of edgeDiff.removed) {
              edgesMap.delete(id);
            }
            for (const { id, changes } of edgeDiff.updated) {
              const edgeMap = edgesMap.get(id);
              if (edgeMap) {
                for (const [k, v] of Object.entries(changes)) {
                  edgeMap.set(k, v);
                }
              }
            }
          }, LOCAL_ORIGIN);
        }

        // --- clips ---
        const clipDiff = diffRecord(prevState.clips, state.clips);
        if (Object.keys(clipDiff.added).length > 0 || clipDiff.removed.length > 0 || clipDiff.updated.length > 0) {
          ydoc.transact(() => {
            for (const [id, clip] of Object.entries(clipDiff.added)) {
              const clipMap = new Y.Map<unknown>();
              for (const [k, v] of Object.entries(clip)) {
                clipMap.set(k, v);
              }
              clipsMap.set(id, clipMap);
            }
            for (const id of clipDiff.removed) {
              clipsMap.delete(id);
            }
            for (const { id, changes } of clipDiff.updated) {
              const clipMap = clipsMap.get(id);
              if (clipMap) {
                for (const [k, v] of Object.entries(changes)) {
                  clipMap.set(k, v);
                }
              }
            }
          }, LOCAL_ORIGIN);
        }

        // --- tracks ---
        const trackDiff = diffRecord(prevState.tracks, state.tracks);
        if (Object.keys(trackDiff.added).length > 0 || trackDiff.removed.length > 0 || trackDiff.updated.length > 0) {
          ydoc.transact(() => {
            for (const [id, track] of Object.entries(trackDiff.added)) {
              const trackMap = new Y.Map<unknown>();
              for (const [k, v] of Object.entries(track)) {
                trackMap.set(k, v);
              }
              tracksMap.set(id, trackMap);
            }
            for (const id of trackDiff.removed) {
              tracksMap.delete(id);
            }
            for (const { id, changes } of trackDiff.updated) {
              const trackMap = tracksMap.get(id);
              if (trackMap) {
                for (const [k, v] of Object.entries(changes)) {
                  trackMap.set(k, v);
                }
              }
            }
          }, LOCAL_ORIGIN);
        }

        // --- assets ---
        const assetDiff = diffRecord(prevState.assets, state.assets);
        if (Object.keys(assetDiff.added).length > 0 || assetDiff.removed.length > 0 || assetDiff.updated.length > 0) {
          ydoc.transact(() => {
            for (const [id, asset] of Object.entries(assetDiff.added)) {
              const assetMap = new Y.Map<unknown>();
              for (const [k, v] of Object.entries(asset)) {
                assetMap.set(k, v);
              }
              assetsMap.set(id, assetMap);
            }
            for (const id of assetDiff.removed) {
              assetsMap.delete(id);
            }
            for (const { id, changes } of assetDiff.updated) {
              const assetMap = assetsMap.get(id);
              if (assetMap) {
                for (const [k, v] of Object.entries(changes)) {
                  assetMap.set(k, v);
                }
              }
            }
          }, LOCAL_ORIGIN);
        }

        // --- projectMeta ---
        const metaChanges: Record<string, unknown> = {};
        if (state.projectTitle !== prevState.projectTitle) {
          metaChanges.title = state.projectTitle;
        }
        const transportKeys: (keyof TransportState)[] = [
          'playing', 'bpm', 'beatOffset', 'timeSignature', 'key', 'scene',
        ];
        for (const key of transportKeys) {
          if (JSON.stringify(state.localTransport[key]) !== JSON.stringify(prevState.localTransport[key])) {
            metaChanges[key] = state.localTransport[key];
          }
        }
        if (Object.keys(metaChanges).length > 0) {
          ydoc.transact(() => {
            for (const [k, v] of Object.entries(metaChanges)) {
              projectMeta.set(k, v);
            }
          }, LOCAL_ORIGIN);
        }
      }

      prevState = state;
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

  return { broadcastCursor, broadcastFocus, collabReady, remoteStateLoaded, ydocRef };
}

function stringToColor(str: string): string {
  const colors = ['#ed922f', '#8fb13a', '#6a9bcc', '#d97757', '#6f7b5d', '#f6df9f'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
