# Normalized CRDT Sync Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic snapshot sync in `useYjsProject.ts` with granular entity-level CRDT sync using dedicated `Y.Map` structures per node, edge, clip, track, and asset.

**Architecture:** Each project entity type gets its own root `Y.Map` containing nested `Y.Map` instances per entity. A diff-based store subscription pushes only changed entities/fields to Yjs, while `observeDeep` listeners on each root map pull remote changes back into Zustand. Two bridge helpers convert between the existing `RealtimeProjectSnapshot` shape and the Yjs tree for server persistence.

**Tech Stack:** React, Zustand, Yjs, y-websocket, Vitest

---

## File Structure

| File | Responsibility |
|---|---|
| `client/src/lib/projectSync.ts` | `RealtimeProjectSnapshot` type + `createRealtimeSnapshot` (existing). **New:** `hydrateYjsFromSnapshot` and `extractSnapshotFromYjs` bridge helpers. |
| `client/src/lib/__tests__/projectSync.test.ts` | Unit tests: round-trip snapshot → Yjs → snapshot for all entity types. |
| `client/src/hooks/useYjsProject.ts` | Existing awareness + cursor logic. **New:** root `Y.Map` setup, incoming `observeDeep` sync, outgoing diff-based store sync, loop suppression. |
| `client/src/App.tsx` | Existing REST hydration. **New:** defer to Yjs tree when no remote shared state exists; call `hydrateYjsFromSnapshot` instead of direct Zustand setters. |

---

## Helpers

### `ymapToObject(ymap: Y.Map): T`

```typescript
function ymapToObject<T>(ymap: Y.Map): T {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of ymap.entries()) {
    obj[key] = value;
  }
  return obj as T;
}
```

### `diffRecord<T>(prev, next)`

```typescript
function diffRecord<T extends Record<string, unknown>>(
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
      for (const key of Object.keys(entity)) {
        if (JSON.stringify(prev[id][key]) !== JSON.stringify(entity[key])) {
          (changes as Record<string, unknown>)[key] = entity[key];
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
```

---

## Task 1: Bridge Helpers + Unit Tests

**Files:**
- Modify: `client/src/lib/projectSync.ts`
- Create: `client/src/lib/__tests__/projectSync.test.ts`

### Step 1: Write failing tests

Create `client/src/lib/__tests__/projectSync.test.ts`:

```typescript
import { describe, test, expect } from 'vitest';
import * as Y from 'yjs';
import {
  hydrateYjsFromSnapshot,
  extractSnapshotFromYjs,
  type RealtimeProjectSnapshot,
} from '../projectSync';

const sampleSnapshot: RealtimeProjectSnapshot = {
  projectTitle: 'Test Jam',
  localTransport: {
    playing: false,
    bpm: 128,
    beatOffset: 0,
    timeSignature: [4, 4],
    key: 'D minor',
    scene: 'A',
  },
  nodes: {
    'node-1': {
      id: 'node-1',
      kind: 'oscillator',
      position: { x: 100, y: 200 },
      params: { frequency: 440 },
    },
  },
  edges: {
    'edge-1': {
      id: 'edge-1',
      sourceNodeId: 'node-1',
      sourcePort: 'out',
      targetNodeId: 'node-2',
      targetPort: 'in',
      signalType: 'audio',
    },
  },
  assets: {},
  clips: {
    'clip-1': {
      id: 'clip-1',
      trackId: 'track-1',
      type: 'midi',
      startBeat: 0,
      lengthBeats: 4,
      loop: false,
    },
  },
  tracks: {
    'track-1': {
      id: 'track-1',
      name: 'Lead',
      color: '#ed922f',
    },
  },
};

describe('hydrateYjsFromSnapshot', () => {
  test('populates projectMeta', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);

    const meta = ydoc.getMap('projectMeta');
    expect(meta.get('title')).toBe('Test Jam');
    expect(meta.get('bpm')).toBe(128);
  });

  test('populates nodes with nested Y.Map', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);

    const nodes = ydoc.getMap('nodes');
    const node1 = nodes.get('node-1') as Y.Map;
    expect(node1.get('kind')).toBe('oscillator');
    expect(node1.get('position')).toEqual({ x: 100, y: 200 });
  });

  test('populates edges', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);

    const edges = ydoc.getMap('edges');
    const edge1 = edges.get('edge-1') as Y.Map;
    expect(edge1.get('signalType')).toBe('audio');
  });

  test('populates clips and tracks', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);

    const clips = ydoc.getMap('clips');
    const clip1 = clips.get('clip-1') as Y.Map;
    expect(clip1.get('trackId')).toBe('track-1');

    const tracks = ydoc.getMap('tracks');
    const track1 = tracks.get('track-1') as Y.Map;
    expect(track1.get('name')).toBe('Lead');
  });
});

describe('extractSnapshotFromYjs', () => {
  test('round-trips all entity types', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);
    const extracted = extractSnapshotFromYjs(ydoc);
    expect(extracted).toEqual(sampleSnapshot);
  });

  test('handles empty project', () => {
    const ydoc = new Y.Doc();
    const empty: RealtimeProjectSnapshot = {
      projectTitle: 'Untitled Jam',
      localTransport: {
        playing: false,
        bpm: 128,
        beatOffset: 0,
        timeSignature: [4, 4],
        key: 'D minor',
        scene: 'A',
      },
      nodes: {},
      edges: {},
      assets: {},
      clips: {},
      tracks: {},
    };
    hydrateYjsFromSnapshot(empty, ydoc);
    expect(extractSnapshotFromYjs(ydoc)).toEqual(empty);
  });
});
```

- [ ] **Step 1: Write the failing test**

Run: `cd /Users/jdbohrman/hayashi/apps/client && npx vitest run src/lib/__tests__/projectSync.test.ts`

Expected: FAIL with `hydrateYjsFromSnapshot is not defined`

- [ ] **Step 2: Run test to verify it fails**

### Step 3: Implement bridge helpers

Add to `client/src/lib/projectSync.ts` **below the existing exports**:

```typescript
import * as Y from 'yjs';
import type {
  Asset,
  Clip,
  PatchEdge,
  PatchNode,
  Track,
  TransportState,
} from '@/types/project';

export function hydrateYjsFromSnapshot(
  snapshot: RealtimeProjectSnapshot,
  ydoc: Y.Doc
): void {
  const projectMeta = ydoc.getMap<unknown>('projectMeta');
  const nodes = ydoc.getMap<Y.Map>('nodes');
  const edges = ydoc.getMap<Y.Map>('edges');
  const clips = ydoc.getMap<Y.Map>('clips');
  const tracks = ydoc.getMap<Y.Map>('tracks');
  const assets = ydoc.getMap<Y.Map>('assets');

  ydoc.transact(() => {
    projectMeta.set('title', snapshot.projectTitle);
    for (const [key, value] of Object.entries(snapshot.localTransport)) {
      projectMeta.set(key, value);
    }

    nodes.clear();
    for (const [id, node] of Object.entries(snapshot.nodes)) {
      const nodeMap = new Y.Map();
      for (const [k, v] of Object.entries(node)) {
        nodeMap.set(k, v);
      }
      nodes.set(id, nodeMap);
    }

    edges.clear();
    for (const [id, edge] of Object.entries(snapshot.edges)) {
      const edgeMap = new Y.Map();
      for (const [k, v] of Object.entries(edge)) {
        edgeMap.set(k, v);
      }
      edges.set(id, edgeMap);
    }

    clips.clear();
    for (const [id, clip] of Object.entries(snapshot.clips)) {
      const clipMap = new Y.Map();
      for (const [k, v] of Object.entries(clip)) {
        clipMap.set(k, v);
      }
      clips.set(id, clipMap);
    }

    tracks.clear();
    for (const [id, track] of Object.entries(snapshot.tracks)) {
      const trackMap = new Y.Map();
      for (const [k, v] of Object.entries(track)) {
        trackMap.set(k, v);
      }
      tracks.set(id, trackMap);
    }

    assets.clear();
    for (const [id, asset] of Object.entries(snapshot.assets)) {
      const assetMap = new Y.Map();
      for (const [k, v] of Object.entries(asset)) {
        assetMap.set(k, v);
      }
      assets.set(id, assetMap);
    }
  });
}

function ymapToObject<T>(ymap: Y.Map): T {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of ymap.entries()) {
    obj[key] = value;
  }
  return obj as T;
}

export function extractSnapshotFromYjs(ydoc: Y.Doc): RealtimeProjectSnapshot {
  const projectMeta = ydoc.getMap<unknown>('projectMeta');
  const nodes = ydoc.getMap<Y.Map>('nodes');
  const edges = ydoc.getMap<Y.Map>('edges');
  const clips = ydoc.getMap<Y.Map>('clips');
  const tracks = ydoc.getMap<Y.Map>('tracks');
  const assets = ydoc.getMap<Y.Map>('assets');

  const localTransport: TransportState = {
    playing: (projectMeta.get('playing') as boolean) ?? false,
    bpm: (projectMeta.get('bpm') as number) ?? 128,
    beatOffset: (projectMeta.get('beatOffset') as number) ?? 0,
    timeSignature: (projectMeta.get('timeSignature') as [number, number]) ?? [4, 4],
    key: (projectMeta.get('key') as string) ?? 'D minor',
    scene: (projectMeta.get('scene') as string) ?? 'A',
  };

  const readRecord = <T>(map: Y.Map<Y.Map>): Record<string, T> => {
    const record: Record<string, T> = {};
    for (const [id, entityMap] of map.entries()) {
      record[id] = ymapToObject(entityMap) as T;
    }
    return record;
  };

  return {
    projectTitle: (projectMeta.get('title') as string) ?? 'Untitled Jam',
    localTransport,
    nodes: readRecord<PatchNode>(nodes),
    edges: readRecord<PatchEdge>(edges),
    clips: readRecord<Clip>(clips),
    tracks: readRecord<Track>(tracks),
    assets: readRecord<Asset>(assets),
  };
}
```

- [ ] **Step 3: Write minimal implementation**

### Step 4: Run tests

Run: `cd /Users/jdbohrman/hayashi/apps/client && npx vitest run src/lib/__tests__/projectSync.test.ts`

Expected: PASS (5 tests)

- [ ] **Step 4: Run test to verify it passes**

### Step 5: Commit

```bash
git add client/src/lib/projectSync.ts client/src/lib/__tests__/projectSync.test.ts
git commit -m "feat: add Yjs hydrate/extract bridge helpers with tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 5: Commit**

---

## Task 2: Incoming Sync (Yjs → Zustand)

**Files:**
- Modify: `client/src/hooks/useYjsProject.ts`

Replace the single `projectMap` snapshot observer with per-entity `observeDeep` listeners. Keep awareness/cursor logic unchanged.

### Step 1: Add root map setup in provider effect

In the `useEffect` that creates/destroys the provider (the one with deps `[channelId, projectId, ...]`), replace:

```typescript
const projectMap = ydoc.getMap<string>('projectState');
```

with:

```typescript
const projectMeta = ydoc.getMap<unknown>('projectMeta');
const nodesMap = ydoc.getMap<Y.Map>('nodes');
const edgesMap = ydoc.getMap<Y.Map>('edges');
const clipsMap = ydoc.getMap<Y.Map>('clips');
const tracksMap = ydoc.getMap<Y.Map>('tracks');
const assetsMap = ydoc.getMap<Y.Map>('assets');
```

Also remove `lastSerializedRef` from this effect (it is no longer needed for the snapshot path, but keep the ref declaration at the top of the hook for now; it can be deleted later).

- [ ] **Step 1: Add root map setup in provider effect**

### Step 2: Remove snapshot-based change handler

Delete the old `handleProjectStateChange` function and its `projectMap.observe(handleProjectStateChange)` call.

- [ ] **Step 2: Remove snapshot-based change handler**

### Step 3: Add incoming sync helpers and observers

Add the following helper functions inside `useYjsProject` (above the provider `useEffect`):

```typescript
function ymapToObject<T>(ymap: Y.Map): T {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of ymap.entries()) {
    obj[key] = value;
  }
  return obj as T;
}

function setupIncomingEntitySync(
  rootMap: Y.Map<Y.Map>,
  entityType: 'node' | 'edge' | 'clip' | 'track' | 'asset',
  suppressRef: React.MutableRefObject<boolean>
): () => void {
  const handleChange = (events: Y.YEvent[], transaction: Y.Transaction) => {
    if (transaction.origin === LOCAL_ORIGIN) return;

    suppressRef.current = true;
    try {
      const store = useProjectStore.getState();

      for (const event of events) {
        const target = event.target as Y.Map;

        if (target === rootMap) {
          // Root map change: entity added or removed
          for (const [id, change] of event.keysChanged.entries()) {
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
          for (const [id, entityMap] of rootMap.entries()) {
            if (entityMap === target) {
              const entity = ymapToObject(entityMap);
              switch (entityType) {
                case 'node': store.setNodes({ ...store.nodes, [id]: entity as PatchNode }); break;
                case 'edge': store.setEdges({ ...store.edges, [id]: entity as PatchEdge }); break;
                case 'clip': store.setClips({ ...store.clips, [id]: entity as Clip }); break;
                case 'track': store.setTracks({ ...store.tracks, [id]: entity as Track }); break;
                case 'asset': store.setAssets({ ...store.assets, [id]: entity as Asset }); break;
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
```

Then wire them up inside the provider `useEffect`, after `provider.on('sync', handleSync)`:

```typescript
const unsubNodes = setupIncomingEntitySync(nodesMap, 'node', suppressStoreSyncRef);
const unsubEdges = setupIncomingEntitySync(edgesMap, 'edge', suppressStoreSyncRef);
const unsubClips = setupIncomingEntitySync(clipsMap, 'clip', suppressStoreSyncRef);
const unsubTracks = setupIncomingEntitySync(tracksMap, 'track', suppressStoreSyncRef);
const unsubAssets = setupIncomingEntitySync(assetsMap, 'asset', suppressStoreSyncRef);

const unsubMeta = (() => {
  const handleMetaChange = (event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
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
```

And add to the cleanup return function:

```typescript
unsubNodes();
unsubEdges();
unsubClips();
unsubTracks();
unsubAssets();
unsubMeta();
```

- [ ] **Step 3: Add incoming sync helpers and observers**

### Step 4: Update `handleSync` to use new helpers

In the `handleSync` function inside the provider effect, replace the snapshot decode/apply block with:

```typescript
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
```

Note: when remote state exists, the `observeDeep` handlers already fired during the Yjs sync and populated Zustand. We no longer need to manually call `applyRealtimeSnapshot`.

- [ ] **Step 4: Update handleSync to use new helpers**

### Step 5: Run typecheck

Run: `cd /Users/jdbohrman/hayashi/apps/client && npm run lint`

Expected: no errors

- [ ] **Step 5: Run typecheck**

### Step 6: Commit

```bash
git add client/src/hooks/useYjsProject.ts
git commit -m "feat: add incoming granular Yjs sync observers

Replace monolithic snapshot observer with per-entity observeDeep
listeners for nodes, edges, clips, tracks, assets, and projectMeta.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 6: Commit**

---

## Task 3: Outgoing Sync (Zustand → Yjs)

**Files:**
- Modify: `client/src/hooks/useYjsProject.ts`

### Step 1: Replace snapshot subscription with diff-based sync

Delete the existing `useEffect` that pushes local state into Yjs (the one with `useProjectStore.subscribe` that creates a snapshot). Replace it with:

```typescript
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

    const nodesMap = ydoc.getMap<Y.Map>('nodes');
    const edgesMap = ydoc.getMap<Y.Map>('edges');
    const clipsMap = ydoc.getMap<Y.Map>('clips');
    const tracksMap = ydoc.getMap<Y.Map>('tracks');
    const assetsMap = ydoc.getMap<Y.Map>('assets');
    const projectMeta = ydoc.getMap<unknown>('projectMeta');

    if (!wasSuppressed) {
      // --- nodes ---
      const nodeDiff = diffRecord(prevState.nodes, state.nodes);
      if (nodeDiff.added.size > 0 || nodeDiff.removed.length > 0 || nodeDiff.updated.length > 0) {
        ydoc.transact(() => {
          for (const [id, node] of Object.entries(nodeDiff.added)) {
            const nodeMap = new Y.Map();
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
      if (edgeDiff.added.size > 0 || edgeDiff.removed.length > 0 || edgeDiff.updated.length > 0) {
        ydoc.transact(() => {
          for (const [id, edge] of Object.entries(edgeDiff.added)) {
            const edgeMap = new Y.Map();
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
      if (clipDiff.added.size > 0 || clipDiff.removed.length > 0 || clipDiff.updated.length > 0) {
        ydoc.transact(() => {
          for (const [id, clip] of Object.entries(clipDiff.added)) {
            const clipMap = new Y.Map();
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
      if (trackDiff.added.size > 0 || trackDiff.removed.length > 0 || trackDiff.updated.length > 0) {
        ydoc.transact(() => {
          for (const [id, track] of Object.entries(trackDiff.added)) {
            const trackMap = new Y.Map();
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
      if (assetDiff.added.size > 0 || assetDiff.removed.length > 0 || assetDiff.updated.length > 0) {
        ydoc.transact(() => {
          for (const [id, asset] of Object.entries(assetDiff.added)) {
            const assetMap = new Y.Map();
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
```

Also add `diffRecord` inside the hook (above the provider effect, near `ymapToObject`):

```typescript
function diffRecord<T extends Record<string, unknown>>(
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
      for (const key of Object.keys(entity)) {
        if (JSON.stringify(prev[id][key]) !== JSON.stringify(entity[key])) {
          (changes as Record<string, unknown>)[key] = entity[key];
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
```

- [ ] **Step 1: Replace snapshot subscription with diff-based sync**

### Step 2: Remove dead snapshot code

Delete from `useYjsProject.ts`:
- `SNAPSHOT_KEY` constant
- `encodeSnapshot` function
- `decodeSnapshot` function
- `applyRealtimeSnapshot` callback
- `lastSerializedRef` ref
- `projectMapRef` ref

Also remove `createRealtimeSnapshot` from the import (it is no longer used in this file; it remains in `projectSync.ts` for App.tsx).

- [ ] **Step 2: Remove dead snapshot code**

### Step 3: Add required imports

At the top of `useYjsProject.ts`, ensure imports include:

```typescript
import type { PatchNode, PatchEdge, Clip, Track, Asset, TransportState } from '@/types/project';
import { setHasRemoteRealtimeState } from '@/lib/projectSync';
```

Remove the `createRealtimeSnapshot` and `RealtimeProjectSnapshot` imports.

- [ ] **Step 3: Add required imports**

### Step 4: Run typecheck

Run: `cd /Users/jdbohrman/hayashi/apps/client && npm run lint`

Expected: no errors

- [ ] **Step 4: Run typecheck**

### Step 5: Commit

```bash
git add client/src/hooks/useYjsProject.ts
git commit -m "feat: add outgoing granular Zustand→Yjs diff sync

Replace monolithic snapshot subscription with per-entity diff-based
push for nodes, edges, clips, tracks, assets, and projectMeta.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 5: Commit**

---

## Task 4: App Hydration Flow

**Files:**
- Modify: `client/src/App.tsx`

### Step 1: Update hydration logic

In the `useEffect` that fetches project state (around line 286), replace the hydration block with:

```typescript
useEffect(() => {
  if (!projectId || !accessToken || !channelId) return;
  if (hydratedRef.current) return;

  if (!collabReady) {
    hydratedRef.current = false;
    return;
  }

  if (remoteStateLoaded || getHasRemoteRealtimeState()) {
    hydratedRef.current = true;
    return;
  }

  // No remote Yjs state exists yet — hydrate from server snapshot into Yjs,
  // then let the incoming observers populate Zustand.
  apiFetchProject(projectId, accessToken)
    .then((doc) => {
      if (!doc) return;

      const snapshot = createRealtimeSnapshot({
        projectTitle: doc.title,
        localTransport: doc.transport,
        nodes: doc.nodes,
        edges: doc.edges,
        assets: doc.assets,
        clips: doc.clips,
        tracks: doc.tracks,
      });

      const ydoc = ydocRef.current;
      if (ydoc) {
        hydrateYjsFromSnapshot(snapshot, ydoc);
      }

      // Also populate Zustand directly so UI is ready even before
      // observers fire (they will fire immediately after hydrate).
      setProjectTitle(doc.title);
      updateLocalTransport(doc.transport);
      setAssets(doc.assets ?? {});
      setNodes(doc.nodes ?? {});
      setEdges(doc.edges ?? {});
      setClips(doc.clips ?? {});
      setTracks(doc.tracks ?? {});

      hydratedRef.current = true;
    })
    .catch(console.error);
}, [
  collabReady,
  remoteStateLoaded,
  projectId,
  accessToken,
  channelId,
  setProjectTitle,
  updateLocalTransport,
  setAssets,
  setNodes,
  setEdges,
  setClips,
  setTracks,
]);
```

**Key change:** When `remoteStateLoaded` is false and `collabReady` is true, we fetch from the server and call `hydrateYjsFromSnapshot(snapshot, ydoc)` to seed the shared Yjs document. The existing `observeDeep` listeners then mirror those entities into Zustand. We also keep the direct Zustand setters for immediate UI readiness.

Make sure `hydrateYjsFromSnapshot` and `createRealtimeSnapshot` are imported from `@/lib/projectSync`, and `ydocRef` is obtained from `useYjsProject`'s return value.

Wait — `ydocRef` is currently internal to `useYjsProject`. We need to expose it so `App.tsx` can call `hydrateYjsFromSnapshot`.

### Step 2: Expose `ydocRef` from `useYjsProject`

In `client/src/hooks/useYjsProject.ts`, add to the return object:

```typescript
return {
  broadcastCursor,
  broadcastFocus,
  collabReady,
  remoteStateLoaded,
  ydocRef, // expose for hydration
};
```

### Step 3: Wire up in App.tsx

In `client/src/App.tsx`, destructure `ydocRef` from `useYjsProject`:

```typescript
const { collabReady, remoteStateLoaded, ydocRef } = useYjsProject(channelId, projectId, participants);
```

Then in the hydration effect, use `ydocRef.current` as the Yjs doc for `hydrateYjsFromSnapshot`.

Make sure to import `hydrateYjsFromSnapshot` and `createRealtimeSnapshot` from `@/lib/projectSync`.

- [ ] **Step 1: Update hydration logic**
- [ ] **Step 2: Expose ydocRef from useYjsProject**
- [ ] **Step 3: Wire up in App.tsx**

### Step 4: Run typecheck

Run: `cd /Users/jdbohrman/hayashi/apps/client && npm run lint`

Expected: no errors

- [ ] **Step 4: Run typecheck**

### Step 5: Commit

```bash
git add client/src/App.tsx client/src/hooks/useYjsProject.ts
git commit -m "feat: hydrate Yjs doc from server snapshot on first join

When no remote shared state exists, seed the Yjs tree from the REST
fetched project so subsequent local edits emit granular deltas.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 5: Commit**

---

## Task 5: Integration Verification

**Files:**
- Create: `client/src/hooks/__tests__/useYjsProject.granular.test.ts`

### Step 1: Write integration test

Create `client/src/hooks/__tests__/useYjsProject.granular.test.ts`:

```typescript
import { describe, test, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { diffRecord } from '../useYjsProject';

describe('diffRecord', () => {
  test('detects added entities', () => {
    const prev = {};
    const next = { a: { id: 'a', x: 1 } };
    const diff = diffRecord(prev, next);
    expect(diff.added).toEqual(next);
    expect(diff.removed).toEqual([]);
    expect(diff.updated).toEqual([]);
  });

  test('detects removed entities', () => {
    const prev = { a: { id: 'a', x: 1 } };
    const next = {};
    const diff = diffRecord(prev, next);
    expect(diff.added).toEqual({});
    expect(diff.removed).toEqual(['a']);
    expect(diff.updated).toEqual([]);
  });

  test('detects updated properties', () => {
    const prev = { a: { id: 'a', x: 1, y: 2 } };
    const next = { a: { id: 'a', x: 10, y: 2 } };
    const diff = diffRecord(prev, next);
    expect(diff.updated).toEqual([{ id: 'a', changes: { x: 10 } }]);
  });

  test('ignores unchanged entities', () => {
    const prev = { a: { id: 'a', x: 1 } };
    const next = { a: { id: 'a', x: 1 } };
    const diff = diffRecord(prev, next);
    expect(diff.added).toEqual({});
    expect(diff.removed).toEqual([]);
    expect(diff.updated).toEqual([]);
  });
});

describe('Yjs granular sync', () => {
  test('two docs converge on node position change', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Simulate shared state: doc1 has a node
    const nodes1 = doc1.getMap<Y.Map>('nodes');
    const nodeMap = new Y.Map();
    nodeMap.set('id', 'node-1');
    nodeMap.set('kind', 'oscillator');
    nodeMap.set('position', { x: 0, y: 0 });
    nodes1.set('node-1', nodeMap);

    // Sync doc1 state to doc2 via update
    const update = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update);

    // Verify doc2 received the node
    const nodes2 = doc2.getMap<Y.Map>('nodes');
    const received = nodes2.get('node-1');
    expect(received?.get('position')).toEqual({ x: 0, y: 0 });

    // Change position in doc2
    doc2.transact(() => {
      received?.set('position', { x: 100, y: 200 });
    });

    // Sync back to doc1
    const update2 = Y.encodeStateAsUpdate(doc2);
    Y.applyUpdate(doc1, update2);

    // Verify doc1 has new position
    expect(nodes1.get('node-1')?.get('position')).toEqual({ x: 100, y: 200 });
  });
});
```

Note: `diffRecord` needs to be exported from `useYjsProject.ts` for this test. Add `export` keyword before `function diffRecord`.

- [ ] **Step 1: Write integration test**

### Step 2: Run tests

Run: `cd /Users/jdbohrman/hayashi/apps/client && npx vitest run src/hooks/__tests__/useYjsProject.granular.test.ts`

Expected: PASS (5 tests)

- [ ] **Step 2: Run tests**

### Step 3: Commit

```bash
git add client/src/hooks/__tests__/useYjsProject.granular.test.ts client/src/hooks/useYjsProject.ts
git commit -m "test: add granular sync integration tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 3: Commit**

---

## Self-Review Checklist

### 1. Spec Coverage

| Spec Requirement | Task |
|---|---|
| `hydrateYjsFromSnapshot` | Task 1 |
| `extractSnapshotFromYjs` | Task 1 |
| Root `Y.Map` per entity type | Task 2 |
| Incoming `observeDeep` sync | Task 2 |
| Outgoing diff-based store sync | Task 3 |
| App hydration defers to Yjs tree | Task 4 |
| Loop suppression | Tasks 2 & 3 |
| Server API unchanged | N/A (no server changes) |

**Gaps:** None identified.

### 2. Placeholder Scan

- No "TBD", "TODO", or "implement later" found.
- All test code is complete with assertions.
- All implementation steps include exact code blocks.
- No vague requirements like "add appropriate error handling".

### 3. Type Consistency

- `diffRecord` returns `{ added: Record<string, T>; removed: string[]; updated: Array<{ id: string; changes: Partial<T> }> }` consistently.
- `Y.Map<Y.Map>` is used consistently for root entity maps.
- `ymapToObject` helper is duplicated in `projectSync.ts` and `useYjsProject.ts` — this is intentional because `projectSync.ts` should not import React hooks, and `useYjsProject.ts` should not depend on `projectSync.ts` for internal helpers. **Acceptable duplication.**

### 4. Cleanup

- `lastSerializedRef` and `projectMapRef` are removed in Task 3.
- `SNAPSHOT_KEY`, `encodeSnapshot`, `decodeSnapshot`, `applyRealtimeSnapshot` are removed in Task 3.
- Dead imports cleaned up in Task 3.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-normalized-crdt-sync.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?