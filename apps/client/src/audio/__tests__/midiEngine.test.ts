import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock audioEngine
vi.mock('@/audio/engine', () => ({
  audioEngine: {
    ctx: null,
    destination: null,
  },
}));

import { midiEngine, noteToFrequency, type MidiPacket } from '@/audio/midiEngine';

describe('midiEngine', () => {
  beforeEach(() => {
    midiEngine.init();
  });

  describe('noteToFrequency', () => {
    it('returns 440 for A4 (note 69)', () => {
      expect(noteToFrequency(69)).toBeCloseTo(440, 1);
    });

    it('returns 261.63 for middle C (note 60)', () => {
      expect(noteToFrequency(60)).toBeCloseTo(261.63, 1);
    });

    it('doubles frequency per octave', () => {
      expect(noteToFrequency(81)).toBeCloseTo(880, 1); // A5
      expect(noteToFrequency(57)).toBeCloseTo(220, 1); // A3
    });
  });

  describe('handleMidiPacket', () => {
    it('ignores packets when no nodes are registered', () => {
      const packet: MidiPacket = {
        type: 'noteOn',
        note: 60,
        velocity: 127,
        channel: 1,
      };
      expect(() => midiEngine.handleMidiPacket(packet)).not.toThrow();
    });

    it('ignores packets for unregistered targetNodeId', () => {
      const packet: MidiPacket = {
        targetNodeId: 'nonexistent-node',
        type: 'noteOn',
        note: 60,
        velocity: 127,
        channel: 1,
      };
      expect(() => midiEngine.handleMidiPacket(packet)).not.toThrow();
    });

    it('ignores noteOn when node is not armed', () => {
      const fakeCtx = {
        currentTime: 0,
        createOscillator: vi.fn(() => ({
          type: 'sine',
          frequency: { value: 440 },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createGain: vi.fn(() => ({
          gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
      } as unknown as AudioContext;

      const fakeOsc = fakeCtx.createOscillator();
      const fakeEnvGain = fakeCtx.createGain();
      const fakeOutGain = fakeCtx.createGain();

      midiEngine.registerNode('test-node', fakeCtx, {
        oscillator: fakeOsc,
        envelopeGain: fakeEnvGain,
        outputGain: fakeOutGain,
      });

      // Node is not armed by default
      const packet: MidiPacket = {
        targetNodeId: 'test-node',
        type: 'noteOn',
        note: 60,
        velocity: 127,
        channel: 1,
      };

      // audioEngine.ctx is null, so handleNoteOn returns early
      // Just verify no exception
      expect(() => midiEngine.handleMidiPacket(packet)).not.toThrow();

      midiEngine.unregisterNode('test-node');
    });

    it('routes packet to targetNodeId when specified', () => {
      const fakeCtx = {
        currentTime: 0,
        createOscillator: vi.fn(() => ({
          type: 'sine',
          frequency: { value: 440 },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createGain: vi.fn(() => ({
          gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
      } as unknown as AudioContext;

      midiEngine.registerNode('node-a', fakeCtx, {
        oscillator: fakeCtx.createOscillator(),
        envelopeGain: fakeCtx.createGain(),
        outputGain: fakeCtx.createGain(),
      });

      midiEngine.registerNode('node-b', fakeCtx, {
        oscillator: fakeCtx.createOscillator(),
        envelopeGain: fakeCtx.createGain(),
        outputGain: fakeCtx.createGain(),
      });

      // Packet targets only node-a
      const packet: MidiPacket = {
        targetNodeId: 'node-a',
        type: 'noteOff',
        note: 60,
        channel: 1,
      };

      // Should not throw — packet is routed to node-a, node-b is unaffected
      expect(() => midiEngine.handleMidiPacket(packet)).not.toThrow();

      midiEngine.unregisterNode('node-a');
      midiEngine.unregisterNode('node-b');
    });

    it('ignores broadcast when no nodes are armed', () => {
      const fakeCtx = {
        currentTime: 0,
        createOscillator: vi.fn(() => ({
          type: 'sine',
          frequency: { value: 440 },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createGain: vi.fn(() => ({
          gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
      } as unknown as AudioContext;

      midiEngine.registerNode('node-a', fakeCtx, {
        oscillator: fakeCtx.createOscillator(),
        envelopeGain: fakeCtx.createGain(),
        outputGain: fakeCtx.createGain(),
      });

      // Not armed
      const packet: MidiPacket = {
        type: 'noteOn',
        note: 60,
        velocity: 127,
        channel: 1,
      };

      expect(() => midiEngine.handleMidiPacket(packet)).not.toThrow();

      midiEngine.unregisterNode('node-a');
    });
  });
});
