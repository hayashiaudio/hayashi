import { renderGraphOffline } from '@/audio/graphCompiler';
import { exportWav } from './offlineBounce';
import type { ProjectSnapshot } from './types';
import type { PatchNode } from '@/types/project';

const SOURCE_KINDS = new Set([
  'oscillator',
  'noise',
  'sampler',
  'drumPad',
  'midiBridge',
]);

function cloneNodesWithMutedOthers(
  nodes: Record<string, PatchNode>,
  keepSourceId: string
): Record<string, PatchNode> {
  const result: Record<string, PatchNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (id === keepSourceId) {
      result[id] = node;
    } else if (SOURCE_KINDS.has(node.kind)) {
      result[id] = { ...node, muted: true };
    } else {
      result[id] = node;
    }
  }
  return result;
}

function getDurationSeconds(snapshot: ProjectSnapshot): number {
  const bpm = snapshot.bpm || 128;
  // Find the furthest clip end
  let maxBeat = 16;
  for (const clip of Object.values(snapshot.clips)) {
    const end = clip.startBeat + clip.lengthBeats;
    if (end > maxBeat) maxBeat = end;
  }
  return (maxBeat * 60) / bpm;
}

export interface StemResult {
  name: string;
  blob: Blob;
}

export async function exportStem(
  snapshot: ProjectSnapshot,
  trackId: string,
  options: { bitDepth?: 16 | 24 } = {}
): Promise<StemResult | null> {
  const track = snapshot.tracks[trackId];
  if (!track?.sourceNodeId) return null;
  if (track.muted) return null;

  const nodes = cloneNodesWithMutedOthers(snapshot.nodes, track.sourceNodeId);
  const duration = getDurationSeconds(snapshot);

  const blob = await exportWav(
    (ctx) => renderGraphOffline(ctx, nodes, snapshot.edges),
    duration,
    48000,
    options.bitDepth ?? 16
  );

  return {
    name: `${track.name || 'Track'}.wav`,
    blob,
  };
}

export async function exportMaster(
  snapshot: ProjectSnapshot,
  options: { bitDepth?: 16 | 24 } = {}
): Promise<StemResult> {
  const duration = getDurationSeconds(snapshot);

  const blob = await exportWav(
    (ctx) => renderGraphOffline(ctx, snapshot.nodes, snapshot.edges),
    duration,
    48000,
    options.bitDepth ?? 16
  );

  return {
    name: 'Master.wav',
    blob,
  };
}

export async function exportAllStems(
  snapshot: ProjectSnapshot,
  options: {
    bitDepth?: 16 | 24;
    includeMaster?: boolean;
    trackIds?: string[];
    onProgress?: (current: number, total: number, name: string) => void;
  } = {}
): Promise<StemResult[]> {
  const results: StemResult[] = [];
  const trackIds = options.trackIds ?? Object.keys(snapshot.tracks);
  const total = trackIds.length + (options.includeMaster !== false ? 1 : 0);
  let current = 0;

  for (const trackId of trackIds) {
    const track = snapshot.tracks[trackId];
    if (!track) continue;
    current++;
    options.onProgress?.(current, total, track.name || 'Track');

    const stem = await exportStem(snapshot, trackId, options);
    if (stem) results.push(stem);
  }

  if (options.includeMaster !== false) {
    current++;
    options.onProgress?.(current, total, 'Master');
    const master = await exportMaster(snapshot, options);
    results.push(master);
  }

  return results;
}
