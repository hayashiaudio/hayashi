# Normalized CRDT Sync Layer — Design Spec

## Problem Statement

The current realtime sync layer serializes the entire project graph as a single JSON snapshot into a Yjs `Y.Map` entry. Every node drag, param tweak, or transport change re-serializes the whole project, creating unnecessary network traffic and causing coarse-grained overwrite conflicts when two users edit different properties of the same node simultaneously.

## Goal

Replace the monolithic snapshot sync with a **granular, entity-level CRDT model** using Yjs native structures (`Y.Map` per entity, nested `Y.Map` per property). This enables:

- Property-level merging (User A edits `cutoff`, User B edits `resonance` on the same node → both changes survive)
- Minimal sync deltas (dragging a node only syncs `position`, not the whole project)
- Clean separation between the live CRDT tree and the REST persistence snapshot format

## Architecture

### Yjs Document Schema

```
Y.Doc
├── projectMeta     Y.Map<string | number>   { title, bpm, beatOffset, timeSignature, key, scene }
├── nodes           Y.Map<Y.Map>             nodeId → Y.Map<PatchNode fields>
├── edges           Y.Map<Y.Map>             edgeId → Y.Map<PatchEdge fields>
├── clips           Y.Map<Y.Map>             clipId → Y.Map<Clip fields>
├── tracks          Y.Map<Y.Map>             trackId → Y.Map<Track fields>
├── assets          Y.Map<Y.Map>             assetId → Y.Map<Asset fields>
└── awareness       (existing, unchanged)
```

**Entity representation:** Each node/edge/clip/track/asset is stored as a nested `Y.Map` with primitive keys (`id`, `kind`, `position`, `params`, etc.). Complex values like `position: {x, y}` are stored as plain JSON-serializable objects inside the `Y.Map` entry (Yjs handles object equality via deep comparison). If we need true sub-property merging later, we can nest another `Y.Map` for `position`.

### Two-Way Sync Layer

The sync layer lives in `useYjsProject.ts` and is composed of three parts:

1. **Outgoing interceptor** — a Zustand middleware (or store subscription filter) that intercepts store mutations and translates them into Yjs operations.
2. **Incoming observer** — `observeDeep` on the root maps that pushes remote changes into Zustand via existing setters.
3. **Loop suppression** — a `suppressStoreSyncRef` flag and `transaction.origin === LOCAL_ORIGIN` check prevent echo.

#### Outgoing Mapping

| Zustand Action | Yjs Operation |
|---|---|
| `addNode(node)` | `nodesYMap.set(node.id, new Y.Map(node))` |
| `removeNode(id)` | `nodesYMap.delete(id)` |
| `updateNodePosition(id, pos)` | `nodesYMap.get(id).set('position', pos)` |
| `updateNodeParams(id, params)` | `nodesYMap.get(id).set('params', mergedParams)` |
| `updateNodeMuted(id, muted)` | `nodesYMap.get(id).set('muted', muted)` |
| `addEdge(edge)` | `edgesYMap.set(edge.id, new Y.Map(edge))` |
| `removeEdge(id)` | `edgesYMap.delete(id)` |
| `addClip(clip)` | `clipsYMap.set(clip.id, new Y.Map(clip))` |
| `removeClip(id)` | `clipsYMap.delete(id)` |
| `updateClipTiming(id, ...)` | `clipsYMap.get(id).set('startBeat', ...)`, `.set('lengthBeats', ...)` |
| `moveClip(id, trackId, startBeat)` | `clipsYMap.get(id).set('trackId', trackId)`, `.set('startBeat', startBeat)` |
| `addTrack(track)` | `tracksYMap.set(track.id, new Y.Map(track))` |
| `removeTrack(id)` | `tracksYMap.delete(id)` |
| `updateTrack(id, patch)` | iterate patch keys, `tracksYMap.get(id).set(key, value)` |
| `updateLocalTransport(t)` | iterate keys, `projectMetaYMap.set(key, value)` |
| `setProjectTitle(title)` | `projectMetaYMap.set('title', title)` |
| `addAsset(asset)` | `assetsYMap.set(asset.id, new Y.Map(asset))` |
| `removeAsset(id)` | `assetsYMap.delete(id)` |

#### Incoming Mapping

The observer listens to `ydoc.getMap('nodes').observeDeep`, `ydoc.getMap('edges').observeDeep`, etc. When a change fires:

1. If `transaction.origin === LOCAL_ORIGIN`, ignore.
2. Read the changed map entries.
3. Call the corresponding Zustand setter (`setNodes`, `updateNodeParams`, etc.) with the new values.
4. Wrap the Zustand updates in `suppressStoreSyncRef = true` to prevent echo back to Yjs.

### Hydration & Persistence Bridge

Two new helpers in `projectSync.ts`:

- `hydrateYjsFromSnapshot(snapshot, ydoc)` — populates the Yjs tree from a `RealtimeProjectSnapshot`. Called once on room join when `remoteStateLoaded === false` (no existing shared state).
- `extractSnapshotFromYjs(ydoc)` — reconstructs a `RealtimeProjectSnapshot` from the Yjs tree. Called on explicit save/export to send to the server.

The server API and `RealtimeProjectSnapshot` shape remain unchanged. Only the live sync layer changes.

## Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Simultaneous node drag | Both users set `position`. Yjs last-writer-wins on the key. Node snaps to most recent mover. |
| Simultaneous param edit (different keys) | Both keys merge cleanly because they are separate `Y.Map` entries. |
| Simultaneous param edit (same key) | Yjs timestamp tie-break: last sync wins. Acceptable for param values. |
| Node deleted while another user edits it | Observer sees `delete`; Zustand calls `removeNode`. Remote editor’s next update is silently ignored because the map entry no longer exists. |
| Partial sync on reconnect | Yjs state-based CRDT guarantees eventual consistency. No custom merge logic required. |
| Undo | **Out of scope for this spec.** `Y.UndoManager` can be added later per sub-document (e.g., undo a node move without undoing a track edit). |

## Testing Strategy

1. **Unit:** `hydrateYjsFromSnapshot` and `extractSnapshotFromYjs` round-trip correctly for a full project.
2. **Integration:** Two `Y.Doc` instances connected via `y-websocket` test provider. Mutate one, assert the other’s Zustand state converges within 100ms.
3. **E2E:** Two browser tabs dragging the same node. Verify position converges without flicker or oscillation.

## Files Changed

- `client/src/hooks/useYjsProject.ts` — replace snapshot sync with granular two-way sync
- `client/src/lib/projectSync.ts` — add `hydrateYjsFromSnapshot` and `extractSnapshotFromYjs`
- `client/src/stores/projectStore.ts` — optionally add middleware for outgoing interception
- `client/src/App.tsx` — update hydration logic to call `hydrateYjsFromSnapshot` when no remote state exists

## Non-Goals

- Replacing Zustand with Yjs as the primary store (Zustand remains the UI source of truth)
- Undo/redo integration (`Y.UndoManager` deferred)
- Converting tracks/clips to `Y.Array` for positional semantics (deferred)
- Server-side Yjs persistence or awareness (out of scope)
