import type { ProjectSnapshot } from './types';
import type { MidiNote, Clip, Track } from '@/types/project';

const TICKS_PER_QUARTER = 480;

/** Write a variable-length quantity (VLQ) for delta-times */
function writeVLQ(value: number): number[] {
  const bytes: number[] = [];
  let v = value;
  do {
    bytes.unshift((v & 0x7f) | (bytes.length > 0 ? 0x80 : 0));
    v >>= 7;
  } while (v > 0);
  // Fix continuation bits
  const result: number[] = [];
  const arr = bytes.reverse();
  for (let i = 0; i < arr.length; i++) {
    const byte = arr[i];
    result.unshift(i < arr.length - 1 ? byte | 0x80 : byte & 0x7f);
  }
  return result.length ? result : [0];
}

function stringToBytes(str: string): number[] {
  return Array.from(str).map((c) => c.charCodeAt(0));
}

function writeChunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    ...stringToBytes(type),
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
    ...data,
  ];
}

/** Convert a MidiNote[] into SMF track events, sorted by time */
function buildNoteEvents(notes: MidiNote[], channel: number): { deltaTicks: number; data: number[] }[] {
  interface Event {
    ticks: number;
    data: number[];
  }

  const events: Event[] = [];
  for (const note of notes) {
    const startTick = Math.round(note.startBeat * TICKS_PER_QUARTER);
    const durationTick = Math.round(note.durationBeats * TICKS_PER_QUARTER);
    const endTick = startTick + durationTick;

    events.push({
      ticks: startTick,
      data: [0x90 | channel, note.pitch, Math.round(note.velocity * 127)],
    });
    events.push({
      ticks: endTick,
      data: [0x80 | channel, note.pitch, Math.round(note.velocity * 127)],
    });
  }

  events.sort((a, b) => a.ticks - b.ticks);

  // Convert absolute ticks to delta ticks
  const result: { deltaTicks: number; data: number[] }[] = [];
  let lastTick = 0;
  for (const evt of events) {
    const delta = evt.ticks - lastTick;
    result.push({ deltaTicks: delta, data: evt.data });
    lastTick = evt.ticks;
  }

  return result;
}

export async function exportMidi(snapshot: ProjectSnapshot): Promise<Blob> {
  const { bpm, timeSignature, key, tracks, clips } = snapshot;

  // Collect MIDI clips per track
  const trackClips = new Map<string, Clip[]>();
  for (const clip of Object.values(clips)) {
    if (clip.type === 'midi' && clip.notes && clip.notes.length > 0) {
      const arr = trackClips.get(clip.trackId) || [];
      arr.push(clip);
      trackClips.set(clip.trackId, arr);
    }
  }

  // Build track list (only tracks with MIDI clips)
  const midiTracks: Track[] = [];
  for (const track of Object.values(tracks)) {
    if (trackClips.has(track.id)) {
      midiTracks.push(track);
    }
  }

  const numTracks = 1 + midiTracks.length; // Track 0 = tempo/meta
  const headerData = [
    0x00, 0x01, // Format Type 1
    (numTracks >> 8) & 0xff,
    numTracks & 0xff,
    (TICKS_PER_QUARTER >> 8) & 0xff,
    TICKS_PER_QUARTER & 0xff,
  ];
  const headerChunk = writeChunk('MThd', headerData);

  // Track 0: Tempo, time signature, key signature
  const tempoEvent: number[] = [
    0x00, // delta
    0xff, 0x51, 0x03,
    0x00, 0x00, 0x00, // placeholder for tempo
  ];
  const usPerQuarter = Math.round(60_000_000 / (bpm || 120));
  tempoEvent[4] = (usPerQuarter >> 16) & 0xff;
  tempoEvent[5] = (usPerQuarter >> 8) & 0xff;
  tempoEvent[6] = usPerQuarter & 0xff;

  const [tsNum, tsDenom] = timeSignature;
  const denomPower = Math.log2(tsDenom);
  const tsEvent: number[] = [
    0x00, // delta
    0xff, 0x58, 0x04,
    tsNum,
    denomPower,
    0x18, // 24 MIDI clocks per metronome click
    0x08, // 32nd notes per quarter
  ];

  // Key signature (simplified: C major / A minor = 0)
  const keySignatures: Record<string, number> = {
    'C major': 0, 'A minor': 0,
    'G major': 1, 'E minor': 1,
    'D major': 2, 'B minor': 2,
    'A major': 3, 'F# minor': 3,
    'E major': 4, 'C# minor': 4,
    'B major': 5, 'G# minor': 5,
    'F# major': 6, 'D# minor': 6,
    'C# major': 7, 'A# minor': 7,
    'F major': -1, 'D minor': -1,
    'Bb major': -2, 'G minor': -2,
    'Eb major': -3, 'C minor': -3,
    'Ab major': -4, 'F minor': -4,
    'Db major': -5, 'Bb minor': -5,
    'Gb major': -6, 'Eb minor': -6,
    'Cb major': -7, 'Ab minor': -7,
  };
  const keySigValue = keySignatures[key] ?? 0;
  const isMinor = key.includes('minor');
  const ksEvent: number[] = [
    0x00, // delta
    0xff, 0x59, 0x02,
    keySigValue & 0xff,
    isMinor ? 1 : 0,
  ];

  const trackNameEvent: number[] = [
    0x00,
    0xff, 0x03,
    5, ...stringToBytes('Tempo'),
  ];

  const endOfTrack: number[] = [0x00, 0xff, 0x2f, 0x00];

  const track0Data: number[] = [
    ...trackNameEvent,
    ...tempoEvent,
    ...tsEvent,
    ...ksEvent,
    ...endOfTrack,
  ];
  const track0Chunk = writeChunk('MTrk', track0Data);

  // Per-track chunks
  const trackChunks: number[][] = [];
  let channel = 0;
  for (const track of midiTracks) {
    channel = (channel + 1) % 16;
    const clipsForTrack = trackClips.get(track.id) || [];
    const allNotes: MidiNote[] = [];
    for (const clip of clipsForTrack) {
      for (const note of clip.notes || []) {
        allNotes.push({
          ...note,
          startBeat: note.startBeat + clip.startBeat,
        });
      }
    }

    const noteEvents = buildNoteEvents(allNotes, channel);

    const trackData: number[] = [];
    // Track name meta
    const name = track.name || `Track ${channel + 1}`;
    trackData.push(0x00, 0xff, 0x03, name.length, ...stringToBytes(name));

    for (const evt of noteEvents) {
      trackData.push(...writeVLQ(evt.deltaTicks), ...evt.data);
    }
    trackData.push(...endOfTrack);
    trackChunks.push(writeChunk('MTrk', trackData));
  }

  const allBytes = [
    ...headerChunk,
    ...track0Chunk,
    ...trackChunks.flat(),
  ];

  const buffer = new Uint8Array(allBytes);
  return new Blob([buffer], { type: 'audio/midi' });
}
