import { audioEngine } from './engine';

export interface MidiPacket {
  targetNodeId?: string;
  type: 'noteOn' | 'noteOff' | 'cc';
  note?: number;
  velocity?: number;
  value?: number;
  channel: number;
}

interface ActiveVoice {
  oscillator: OscillatorNode;
  envelopeGain: GainNode;
  note: number;
  startTime: number;
}

interface MidiNodeState {
  voices: Map<number, ActiveVoice>;
  outputGain: GainNode;
  envelopeGain: GainNode;
  oscillator: OscillatorNode;
  waveform: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  gain: number;
  channelFilter: number | 'all';
  armed: boolean;
}

let broadcastChannel: BroadcastChannel | null = null;

function getOrCreateChannel(): BroadcastChannel {
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel('hayashi-midi');
  }
  return broadcastChannel;
}

export function sendMidiPacket(packet: MidiPacket) {
  try {
    getOrCreateChannel().postMessage(packet);
  } catch (e) {
    console.warn('[Hayashi] Failed to broadcast MIDI packet:', e);
  }
}

export function noteToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

class MidiEngine {
  private nodes = new Map<string, MidiNodeState>();

  registerNode(
    nodeId: string,
    _ctx: AudioContext,
    opts: {
      oscillator: OscillatorNode;
      envelopeGain: GainNode;
      outputGain: GainNode;
    }
  ) {
    this.unregisterNode(nodeId);

    const state: MidiNodeState = {
      voices: new Map(),
      outputGain: opts.outputGain,
      envelopeGain: opts.envelopeGain,
      oscillator: opts.oscillator,
      waveform: 'sine',
      attack: 0.01,
      decay: 0.3,
      sustain: 0.6,
      release: 0.5,
      gain: 0.8,
      channelFilter: 'all',
      armed: false,
    };

    this.nodes.set(nodeId, state);
  }

  unregisterNode(nodeId: string) {
    const state = this.nodes.get(nodeId);
    if (!state) return;

    for (const voice of state.voices.values()) {
      try {
        this.triggerRelease(voice, state.release);
      } catch {
        // ignore
      }
    }

    state.voices.clear();
    this.nodes.delete(nodeId);
  }

  updateNodeParams(
    nodeId: string,
    params: Partial<{
      waveform: string;
      attack: number;
      decay: number;
      sustain: number;
      release: number;
      gain: number;
      channelFilter: number | 'all';
      armed: boolean;
    }>
  ) {
    const state = this.nodes.get(nodeId);
    if (!state) return;

    if (params.waveform !== undefined) {
      state.waveform = params.waveform;
      try {
        state.oscillator.type = params.waveform as OscillatorType;
      } catch {
        // ignore invalid type
      }
    }
    if (params.attack !== undefined) state.attack = params.attack;
    if (params.decay !== undefined) state.decay = params.decay;
    if (params.sustain !== undefined) state.sustain = params.sustain;
    if (params.release !== undefined) state.release = params.release;
    if (params.gain !== undefined) {
      state.gain = params.gain;
      const ctx = audioEngine.ctx;
      if (ctx) {
        state.outputGain.gain.setTargetAtTime(params.gain, ctx.currentTime, 0.01);
      }
    }
    if (params.channelFilter !== undefined) state.channelFilter = params.channelFilter;
    if (params.armed !== undefined) state.armed = params.armed;
  }

  private triggerAttack(voice: ActiveVoice, velocity: number, state: MidiNodeState) {
    const ctx = audioEngine.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = voice.envelopeGain.gain;

    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(velocity / 127, now + state.attack);
    gain.setTargetAtTime(state.sustain * (velocity / 127), now + state.attack, state.decay || 0.001);
  }

  private triggerRelease(voice: ActiveVoice, releaseSeconds: number) {
    const ctx = audioEngine.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = voice.envelopeGain.gain;

    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.exponentialRampToValueAtTime(0.001, now + releaseSeconds);

    window.setTimeout(() => {
      try {
        voice.oscillator.stop();
        voice.oscillator.disconnect();
        voice.envelopeGain.disconnect();
      } catch {
        // may already be stopped
      }
    }, releaseSeconds * 1000 + 50);
  }

  private handleNoteOn(nodeId: string, note: number, velocity: number, _channel: number) {
    const state = this.nodes.get(nodeId);
    if (!state || !state.armed) return;

    const ctx = audioEngine.ctx;
    if (!ctx) return;

    // Release existing voice for same note (mono/poly retrigger)
    const existing = state.voices.get(note);
    if (existing) {
      this.triggerRelease(existing, 0.02);
      state.voices.delete(note);
    }

    const osc = ctx.createOscillator();
    osc.type = state.waveform as OscillatorType;
    osc.frequency.value = noteToFrequency(note);

    const envGain = ctx.createGain();
    envGain.gain.value = 0;

    osc.connect(envGain);
    envGain.connect(state.outputGain);

    osc.start();

    const voice: ActiveVoice = {
      oscillator: osc,
      envelopeGain: envGain,
      note,
      startTime: ctx.currentTime,
    };

    state.voices.set(note, voice);
    this.triggerAttack(voice, velocity, state);
  }

  private handleNoteOff(nodeId: string, note: number, _channel: number) {
    const state = this.nodes.get(nodeId);
    if (!state) return;

    const voice = state.voices.get(note);
    if (!voice) return;

    this.triggerRelease(voice, state.release);
    state.voices.delete(note);
  }

  handleMidiPacket(packet: MidiPacket) {
    if (packet.targetNodeId && this.nodes.has(packet.targetNodeId)) {
      if (packet.type === 'noteOn' && packet.note !== undefined && packet.velocity !== undefined) {
        this.handleNoteOn(packet.targetNodeId, packet.note, packet.velocity, packet.channel);
      } else if (packet.type === 'noteOff' && packet.note !== undefined) {
        this.handleNoteOff(packet.targetNodeId, packet.note, packet.channel);
      }
      return;
    }

    // Broadcast to all armed nodes if no specific target
    for (const [nodeId, state] of this.nodes) {
      if (!state.armed) continue;
      if (packet.type === 'noteOn' && packet.note !== undefined && packet.velocity !== undefined) {
        this.handleNoteOn(nodeId, packet.note, packet.velocity, packet.channel);
      } else if (packet.type === 'noteOff' && packet.note !== undefined) {
        this.handleNoteOff(nodeId, packet.note, packet.channel);
      }
    }
  }

  init() {
    const channel = getOrCreateChannel();
    channel.onmessage = (event: MessageEvent<MidiPacket>) => {
      if (event.data && typeof event.data === 'object') {
        this.handleMidiPacket(event.data);
      }
    };
  }
}

export const midiEngine = new MidiEngine();
midiEngine.init();
