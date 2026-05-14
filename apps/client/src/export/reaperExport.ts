import type { ProjectSnapshot } from './types';
import type { Clip, Track } from '@/types/project';

function guid(): string {
  return '{' + crypto.randomUUID().toUpperCase() + '}';
}

function secondsFromBeats(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

function hexColor(color?: string): number {
  if (!color) return 0;
  const clean = color.replace('#', '');
  if (clean.length !== 6) return 0;
  return parseInt(clean, 16);
}

function buildTrackBlock(track: Track, clips: Clip[], bpm: number, depth = 0): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  lines.push(`${indent}<TRACK ${guid()}`);
  lines.push(`${indent}  NAME "${track.name || 'Track'}"`);
  if (track.color) {
    lines.push(`${indent}  PEAKCOL ${hexColor(track.color)}`);
  }
  lines.push(`${indent}  BEAT 1`);

  // Per-track items (clips)
  for (const clip of clips) {
    const pos = secondsFromBeats(clip.startBeat, bpm);
    const len = secondsFromBeats(clip.lengthBeats, bpm);
    lines.push(`${indent}  <ITEM`);
    lines.push(`${indent}    POSITION ${pos.toFixed(6)}`);
    lines.push(`${indent}    LENGTH ${len.toFixed(6)}`);
    lines.push(`${indent}    NAME "${clip.assetId || 'untitled'}"`);
    lines.push(`${indent}    <SOURCE WAVE`);
    lines.push(`${indent}      FILE "stems/${track.name || 'Track'}.wav"`);
    lines.push(`${indent}    >`);
    lines.push(`${indent}  >`);
  }

  lines.push(`${indent}>`);
  return lines.join('\n');
}

export async function exportReaper(snapshot: ProjectSnapshot): Promise<{ rpp: string; filename: string }> {
  const { title, bpm, timeSignature, tracks, clips } = snapshot;
  const [tsNum, tsDenom] = timeSignature;

  const ts = Date.now();
  const ver = '7.0/Win64';

  const lines: string[] = [];
  lines.push(`<REAPER_PROJECT 0.1 "${ver}" ${ts}`);
  lines.push(`  RIPPLE 0`);
  lines.push(`  GROUPOVERRIDE 0`);
  lines.push(`  AUTOXFADE 1`);
  lines.push(`  ENVATTACH 3`);
  lines.push(`  PANMODE 3`);
  lines.push(`  CURSOR 0`);
  lines.push(`  ZOOM 1`);
  lines.push(`  VZOOMEX 6`);
  lines.push(`  BPM ${bpm || 120}`);
  lines.push(`  BEATINFO ${tsNum} ${Math.log2(tsDenom)} 0`);
  lines.push(`  RATE 48000`);

  // Collect clips per track
  const trackClips = new Map<string, Clip[]>();
  for (const clip of Object.values(clips)) {
    if (clip.type === 'audio') {
      const arr = trackClips.get(clip.trackId) || [];
      arr.push(clip);
      trackClips.set(clip.trackId, arr);
    }
  }

  // Tracks
  for (const track of Object.values(tracks)) {
    const clipsForTrack = trackClips.get(track.id) || [];
    lines.push(buildTrackBlock(track, clipsForTrack, bpm || 120, 1));
  }

  // Master track
  lines.push(`  <TRACK`);
  lines.push(`    NAME "Master"`);
  lines.push(`    ISBUS 2 -1`);
  lines.push(`    BUSCOMP -1 -1`);
  lines.push(`    TRACKHEIGHT 0 0`);
  lines.push(`    VOLPAN 1 0 -1 -1 1`);
  lines.push(`  >`);

  lines.push(`>`);

  const rpp = lines.join('\n');
  return { rpp, filename: `${title || 'project'}.rpp` };
}
