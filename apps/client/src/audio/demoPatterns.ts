export interface DemoPattern {
  bpm: number;
  key: string;
  scale: number[];
  drums: {
    kick: number[];
    snare: number[];
    hat: number[];
  };
  bassline: { note: number; start: number; duration: number }[];
}

const C_MINOR = [48, 50, 51, 53, 55, 56, 58];
const F_MINOR = [53, 55, 56, 58, 60, 61, 63];
const A_MINOR = [57, 59, 60, 62, 64, 65, 67];
const D_MINOR = [50, 52, 53, 55, 57, 58, 60];

export const DEMO_PATTERNS: Record<string, DemoPattern> = {
  disco: {
    bpm: 123,
    key: 'C-minor',
    scale: C_MINOR,
    drums: {
      kick: [0, 4, 8, 12],
      snare: [4, 12],
      hat: [0, 2, 3, 6, 8, 10, 11, 14],
    },
    bassline: [
      { note: 0, start: 0, duration: 2 },
      { note: 0, start: 3, duration: 1 },
      { note: 4, start: 4, duration: 2 },
      { note: 3, start: 7, duration: 1 },
      { note: 3, start: 8, duration: 2 },
      { note: 5, start: 11, duration: 1 },
      { note: 4, start: 12, duration: 2 },
      { note: 2, start: 15, duration: 1 },
    ],
  },
  trap: {
    bpm: 140,
    key: 'F-minor',
    scale: F_MINOR,
    drums: {
      kick: [0, 7, 10, 12, 15],
      snare: [4, 12],
      hat: [0, 1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15],
    },
    bassline: [
      { note: 0, start: 0, duration: 3 },
      { note: 0, start: 7, duration: 1 },
      { note: 3, start: 8, duration: 2 },
      { note: 6, start: 11, duration: 1 },
      { note: 0, start: 12, duration: 3 },
    ],
  },
  house: {
    bpm: 128,
    key: 'A-minor',
    scale: A_MINOR,
    drums: {
      kick: [0, 4, 8, 12],
      snare: [4, 12],
      hat: [2, 4, 6, 8, 10, 12, 14],
    },
    bassline: [
      { note: 0, start: 0, duration: 1 },
      { note: 2, start: 2, duration: 1 },
      { note: 4, start: 4, duration: 1 },
      { note: 2, start: 6, duration: 1 },
      { note: 5, start: 8, duration: 1 },
      { note: 4, start: 10, duration: 1 },
      { note: 3, start: 12, duration: 1 },
      { note: 2, start: 14, duration: 1 },
    ],
  },
  ambient: {
    bpm: 90,
    key: 'D-minor',
    scale: D_MINOR,
    drums: {
      kick: [],
      snare: [],
      hat: [],
    },
    bassline: [
      { note: 0, start: 0, duration: 12 },
      { note: 4, start: 12, duration: 4 },
    ],
  },
};

export function getDemoPattern(style: string): DemoPattern {
  return DEMO_PATTERNS[style] ?? DEMO_PATTERNS.disco;
}
