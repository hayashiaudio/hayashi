export type MidiMessageHandler = (data: Uint8Array) => void;

export type MidiCCMessage = {
  type: 'cc';
  channel: number;
  cc: number;
  value: number;
};

export type MidiNoteOnMessage = {
  type: 'noteOn';
  channel: number;
  note: number;
  velocity: number;
};

export type MidiNoteOffMessage = {
  type: 'noteOff';
  channel: number;
  note: number;
};

let midiAccess: MIDIAccess | null = null;
let midiAccessPromise: Promise<MIDIAccess> | null = null;
const handlers = new Set<MidiMessageHandler>();

export async function requestMidiAccess(): Promise<MIDIAccess> {
  if (midiAccessPromise) {
    return midiAccessPromise;
  }

  midiAccessPromise = (async () => {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      throw new Error('Web MIDI API not supported');
    }
    try {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      throw new Error(
        `Failed to request MIDI access: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    midiAccess.inputs.forEach(attachHandler);
    midiAccess.onstatechange = (e) => {
      if (e.port && e.port.type === 'input' && e.port.state === 'connected') {
        attachHandler(e.port as MIDIInput);
      }
    };
    return midiAccess;
  })();

  return midiAccessPromise;
}

function attachHandler(input: MIDIInput) {
  input.onmidimessage = (e) => {
    const data = e.data;
    if (data) handlers.forEach((h) => h(data));
  };
}

export function getMidiInputs(): MIDIInput[] {
  if (!midiAccess) return [];
  return Array.from(midiAccess.inputs.values());
}

export function addMidiHandler(handler: MidiMessageHandler) {
  handlers.add(handler);
}

export function removeMidiHandler(handler: MidiMessageHandler) {
  handlers.delete(handler);
}

export function parseMidiMessage(
  data: Uint8Array
): MidiCCMessage | MidiNoteOnMessage | MidiNoteOffMessage | null {
  if (data.length < 3) return null;
  const status = data[0];
  const type = status & 0xf0;
  const channel = status & 0x0f;
  if (type === 0xb0) {
    return { type: 'cc', channel, cc: data[1], value: data[2] / 127 };
  }
  if (type === 0x90 && data[2] > 0) {
    return { type: 'noteOn', channel, note: data[1], velocity: data[2] / 127 };
  }
  if (type === 0x80 || (type === 0x90 && data[2] === 0)) {
    return { type: 'noteOff', channel, note: data[1] };
  }
  return null;
}
