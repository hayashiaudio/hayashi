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
