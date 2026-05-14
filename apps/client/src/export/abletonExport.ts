import { deflate } from 'pako';
import type { ProjectSnapshot } from './types';
import type { Clip, Track } from '@/types/project';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildAbletonXml(snapshot: ProjectSnapshot): string {
  const { bpm, tracks, clips } = snapshot;

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<Ableton MajorVersion="5" MinorVersion="11.0_113" SchemaChangeCount="3" Creator="Hayashi">`);
  lines.push(`  <LiveSet>`);
  lines.push(`    <NextPointeeId Value="1" />`);
  lines.push(`    <Tempo>`);
  lines.push(`      <Manual Value="${bpm || 120}" />`);
  lines.push(`    </Tempo>`);
  lines.push(`    <TimeSelection>`);
  lines.push(`      <AnchorTime Value="0" />`);
  lines.push(`      <OtherTime Value="4" />`);
  lines.push(`    </TimeSelection>`);
  lines.push(`    <Tracks>`);

  // Collect clips per track
  const trackClips = new Map<string, Clip[]>();
  for (const clip of Object.values(clips)) {
    if (clip.type === 'audio') {
      const arr = trackClips.get(clip.trackId) || [];
      arr.push(clip);
      trackClips.set(clip.trackId, arr);
    }
  }

  let trackId = 0;
  for (const track of Object.values(tracks)) {
    const clipsForTrack = trackClips.get(track.id) || [];
    lines.push(buildAudioTrackXml(track, clipsForTrack, trackId));
    trackId++;
  }

  lines.push(`    </Tracks>`);
  lines.push(`  </LiveSet>`);
  lines.push(`</Ableton>`);

  return lines.join('\n');
}

function buildAudioTrackXml(track: Track, clips: Clip[], id: number): string {
  const lines: string[] = [];
  lines.push(`      <AudioTrack Id="${id}">`);
  lines.push(`        <Name>`);
  lines.push(`          <EffectiveName Value="${escapeXml(track.name || 'Audio')}" />`);
  lines.push(`        </Name>`);
  lines.push(`        <DeviceChain>`);
  lines.push(`          <MainSequencer>`);
  lines.push(`            <ClipSlotList>`);

  let slotId = 0;
  for (const clip of clips) {
    lines.push(`              <ClipSlot Id="${slotId}">`);
    lines.push(`                <ClipSlot>`);
    lines.push(`                  <Value>`);
    lines.push(`                    <AudioClip Id="${slotId}" Time="${clip.startBeat}">`);
    lines.push(`                      <Name Value="${escapeXml(clip.assetId || 'Clip')}" />`);
    lines.push(`                      <SampleRef>`);
    lines.push(`                        <FileRef>`);
    lines.push(`                          <RelativePath>`);
    lines.push(`                            <Path Value="stems/${escapeXml(track.name || 'Audio')}.wav" />`);
    lines.push(`                          </RelativePath>`);
    lines.push(`                        </FileRef>`);
    lines.push(`                      </SampleRef>`);
    lines.push(`                      <Loop>`);
    lines.push(`                        <LoopStart Value="0" />`);
    lines.push(`                        <LoopEnd Value="${clip.lengthBeats}" />`);
    lines.push(`                        <StartRelative Value="0" />`);
    lines.push(`                        <EndRelative Value="${clip.lengthBeats}" />`);
    lines.push(`                        <LoopOn Value="${clip.loop ? 'true' : 'false'}" />`);
    lines.push(`                      </Loop>`);
    lines.push(`                    </AudioClip>`);
    lines.push(`                  </Value>`);
    lines.push(`                </ClipSlot>`);
    lines.push(`              </ClipSlot>`);
    slotId++;
  }

  lines.push(`            </ClipSlotList>`);
  lines.push(`          </MainSequencer>`);
  lines.push(`        </DeviceChain>`);
  lines.push(`      </AudioTrack>`);

  return lines.join('\n');
}

export async function exportAbleton(snapshot: ProjectSnapshot): Promise<{ blob: Blob; filename: string }> {
  const xml = buildAbletonXml(snapshot);
  const compressed = deflate(xml);
  const blob = new Blob([compressed], { type: 'application/octet-stream' });
  return {
    blob,
    filename: `${snapshot.title || 'project'}.als`,
  };
}
