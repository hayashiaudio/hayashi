import { useProjectStore } from '@/stores/projectStore';
import type { ProjectSnapshot } from './types';

export function collectProjectSnapshot(): ProjectSnapshot {
  const state = useProjectStore.getState();

  return {
    title: state.projectTitle,
    bpm: state.localTransport.bpm,
    timeSignature: state.localTransport.timeSignature,
    key: state.localTransport.key,
    scale: 'major',
    nodes: state.nodes,
    edges: state.edges,
    clips: state.clips,
    tracks: state.tracks,
    assets: state.assets,
    scenes: [],
  };
}
