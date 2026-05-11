import * as Y from 'yjs';
import type {
  Asset,
  Clip,
  PatchEdge,
  PatchNode,
  Track,
  TransportState,
} from '@/types/project';

export interface RealtimeProjectSnapshot {
  projectTitle: string;
  localTransport: TransportState;
  nodes: Record<string, PatchNode>;
  edges: Record<string, PatchEdge>;
  assets: Record<string, Asset>;
  clips: Record<string, Clip>;
  tracks: Record<string, Track>;
}

let hasRemoteState = false;

export function setHasRemoteRealtimeState(next: boolean) {
  hasRemoteState = next;
}

export function getHasRemoteRealtimeState() {
  return hasRemoteState;
}

export function createRealtimeSnapshot(input: RealtimeProjectSnapshot): RealtimeProjectSnapshot {
  return {
    projectTitle: input.projectTitle,
    localTransport: input.localTransport,
    nodes: input.nodes,
    edges: input.edges,
    assets: input.assets,
    clips: input.clips,
    tracks: input.tracks,
  };
}

function setYMapFromRecord(
  parent: Y.Map<Y.Map<unknown>>,
  record: Record<string, unknown>
): void {
  parent.clear();
  for (const [id, obj] of Object.entries(record)) {
    const m = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      m.set(k, v);
    }
    parent.set(id, m);
  }
}

function ymapToObject<T>(ymap: Y.Map<unknown>): T {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of ymap.entries()) {
    obj[key] = value;
  }
  return obj as T;
}

export function hydrateYjsFromSnapshot(
  snapshot: RealtimeProjectSnapshot,
  ydoc: Y.Doc
): void {
  const projectMeta = ydoc.getMap<unknown>('projectMeta');
  const nodes = ydoc.getMap<Y.Map<unknown>>('nodes');
  const edges = ydoc.getMap<Y.Map<unknown>>('edges');
  const clips = ydoc.getMap<Y.Map<unknown>>('clips');
  const tracks = ydoc.getMap<Y.Map<unknown>>('tracks');
  const assets = ydoc.getMap<Y.Map<unknown>>('assets');

  ydoc.transact(() => {
    projectMeta.clear();
    projectMeta.set('title', snapshot.projectTitle);
    for (const [key, value] of Object.entries(snapshot.localTransport)) {
      projectMeta.set(key, value);
    }

    setYMapFromRecord(nodes, snapshot.nodes);
    setYMapFromRecord(edges, snapshot.edges);
    setYMapFromRecord(clips, snapshot.clips);
    setYMapFromRecord(tracks, snapshot.tracks);
    setYMapFromRecord(assets, snapshot.assets);
  });
}

export function extractSnapshotFromYjs(ydoc: Y.Doc): RealtimeProjectSnapshot {
  const projectMeta = ydoc.getMap<unknown>('projectMeta');
  const nodes = ydoc.getMap<Y.Map<unknown>>('nodes');
  const edges = ydoc.getMap<Y.Map<unknown>>('edges');
  const clips = ydoc.getMap<Y.Map<unknown>>('clips');
  const tracks = ydoc.getMap<Y.Map<unknown>>('tracks');
  const assets = ydoc.getMap<Y.Map<unknown>>('assets');

  const localTransport: TransportState = {
    playing: (projectMeta.get('playing') as boolean) ?? false,
    bpm: (projectMeta.get('bpm') as number) ?? 128,
    beatOffset: (projectMeta.get('beatOffset') as number) ?? 0,
    timeSignature: (projectMeta.get('timeSignature') as [number, number]) ?? [4, 4],
    key: (projectMeta.get('key') as string) ?? 'D minor',
    scene: (projectMeta.get('scene') as string) ?? 'A',
    startedAtServerTime: projectMeta.get('startedAtServerTime') as number | undefined,
  };

  const readRecord = <T>(map: Y.Map<Y.Map<unknown>>): Record<string, T> => {
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
