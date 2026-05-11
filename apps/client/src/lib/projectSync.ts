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
