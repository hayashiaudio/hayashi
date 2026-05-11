import type { NodeKind } from '@/types/project';

export type NodeCategory = 'source' | 'modulator' | 'processor' | 'utility' | 'sink';

export interface NodeDefinition {
  kind: NodeKind;
  label: string;
  description: string;
  category: NodeCategory;
  icon: string;
  defaultParams: Record<string, number | string | boolean>;
  inputs: number;
  outputs: number;
}

export const BUILTIN_NODES: NodeDefinition[] = [
  // Sources
  {
    kind: 'oscillator',
    label: 'Oscillator',
    description: 'Sine, saw, square, triangle waves',
    category: 'source',
    icon: 'Activity',
    defaultParams: { frequency: 440, type: 'sine', gain: 0.5 },
    inputs: 0,
    outputs: 1,
  },
  {
    kind: 'noise',
    label: 'Noise',
    description: 'White, pink, brown noise generator',
    category: 'source',
    icon: 'Radio',
    defaultParams: { type: 'white', gain: 0.3 },
    inputs: 0,
    outputs: 1,
  },
  {
    kind: 'sampler',
    label: 'Sampler',
    description: 'Play loaded audio files',
    category: 'source',
    icon: 'Music2',
    defaultParams: { playbackRate: 1, loop: false, start: 0, end: 1 },
    inputs: 0,
    outputs: 1,
  },
  {
    kind: 'drumPad',
    label: 'Drum Pad',
    description: 'Trigger drum samples',
    category: 'source',
    icon: 'Drum',
    defaultParams: { sample: '', gain: 0.8 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'micInput',
    label: 'Mic Input',
    description: 'Capture live microphone audio',
    category: 'source',
    icon: 'Mic',
    defaultParams: { gain: 0.8, monitor: true },
    inputs: 0,
    outputs: 1,
  },
  // Processors
  {
    kind: 'gain',
    label: 'Gain',
    description: 'Volume and VCA control',
    category: 'processor',
    icon: 'Zap',
    defaultParams: { gain: 0.8 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'filter',
    label: 'Filter',
    description: 'Lowpass, highpass, bandpass',
    category: 'processor',
    icon: 'SlidersHorizontal',
    defaultParams: { frequency: 800, Q: 1, type: 'lowpass' },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'delay',
    label: 'Delay',
    description: 'Echo and feedback',
    category: 'processor',
    icon: 'Clock',
    defaultParams: { time: 0.3, feedback: 0.3, mix: 0.5 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'reverb',
    label: 'Reverb',
    description: 'Convolution and algorithmic reverb',
    category: 'processor',
    icon: 'Cloud',
    defaultParams: { decay: 2, mix: 0.3 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'distortion',
    label: 'Distortion',
    description: 'Saturation and drive',
    category: 'processor',
    icon: 'Flame',
    defaultParams: { amount: 0.5 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'compressor',
    label: 'Compressor',
    description: 'Dynamic range compression',
    category: 'processor',
    icon: 'ArrowDownNarrowWide',
    defaultParams: { threshold: -24, ratio: 4, attack: 0.01, release: 0.1 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'bitcrusher',
    label: 'Bitcrusher',
    description: 'Sample rate and bit depth reduction',
    category: 'processor',
    icon: 'Binary',
    defaultParams: { bits: 8, sampleRate: 22050 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'stereoPanner',
    label: 'Pan',
    description: 'Stereo balance control',
    category: 'processor',
    icon: 'MoveRight',
    defaultParams: { pan: 0 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'limiter',
    label: 'Limiter',
    description: 'Brickwall peak limiter',
    category: 'processor',
    icon: 'ArrowDownNarrowWide',
    defaultParams: { threshold: -0.1, ratio: 20, attack: 0.003, release: 0.1 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'tremolo',
    label: 'Tremolo',
    description: 'Amplitude modulation',
    category: 'processor',
    icon: 'Activity',
    defaultParams: { rate: 5, depth: 0.5 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'autopan',
    label: 'Autopan',
    description: 'Auto stereo panning',
    category: 'processor',
    icon: 'Waves',
    defaultParams: { rate: 0.5, depth: 0.8 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'chorus',
    label: 'Chorus',
    description: 'Modulated delay chorus',
    category: 'processor',
    icon: 'Disc3',
    defaultParams: { rate: 0.5, depth: 0.5, mix: 0.5 },
    inputs: 1,
    outputs: 1,
  },
  {
    kind: 'pingPongDelay',
    label: 'Ping-Pong',
    description: 'Stereo bouncing delay',
    category: 'processor',
    icon: 'Clock',
    defaultParams: { time: 0.3, feedback: 0.4, mix: 0.5 },
    inputs: 1,
    outputs: 1,
  },

  // Custom
  {
    kind: 'faust',
    label: 'Faust',
    description: 'Custom Faust DSP module',
    category: 'processor',
    icon: 'Code2',
    defaultParams: {},
    inputs: 1,
    outputs: 1,
  },

  // Sink
  {
    kind: 'output',
    label: 'Output',
    description: 'Master bus',
    category: 'sink',
    icon: 'Waves',
    defaultParams: { gain: 1 },
    inputs: 1,
    outputs: 0,
  },

  // Workstation
  {
    kind: 'workstation',
    label: 'Workstation',
    description: 'DAW-style clip arrangement block',
    category: 'utility',
    icon: 'Clapperboard',
    defaultParams: { gain: 1 },
    inputs: 2,
    outputs: 1,
  },
];

export function getNodeDefinition(kind: NodeKind): NodeDefinition | undefined {
  return BUILTIN_NODES.find((n) => n.kind === kind);
}

export function getDefaultParams(kind: NodeKind): Record<string, number | string | boolean> {
  const def = getNodeDefinition(kind);
  return def ? { ...def.defaultParams } : {};
}
