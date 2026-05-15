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
      hat: [2, 6, 10, 14],
    },
    bassline: [
      { note: 0, start: 0, duration: 2 },
      { note: 4, start: 4, duration: 2 },
      { note: 3, start: 8, duration: 2 },
      { note: 4, start: 12, duration: 2 },
    ],
  },
  trap: {
    bpm: 140,
    key: 'F-minor',
    scale: F_MINOR,
    drums: {
      kick: [0, 3, 8, 10],
      snare: [4, 12],
      hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    },
    bassline: [
      { note: 0, start: 0, duration: 1 },
      { note: 0, start: 3, duration: 1 },
      { note: 3, start: 8, duration: 2 },
      { note: 0, start: 12, duration: 2 },
    ],
  },
  house: {
    bpm: 128,
    key: 'A-minor',
    scale: A_MINOR,
    drums: {
      kick: [0, 4, 8, 12],
      snare: [4, 12],
      hat: [2, 6, 10, 14],
    },
    bassline: [
      { note: 0, start: 0, duration: 2 },
      { note: 2, start: 4, duration: 2 },
      { note: 4, start: 8, duration: 2 },
      { note: 3, start: 12, duration: 2 },
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
      { note: 0, start: 0, duration: 8 },
      { note: 2, start: 8, duration: 8 },
    ],
  },
};

export function getDemoPattern(style: string): DemoPattern {
  return DEMO_PATTERNS[style] ?? DEMO_PATTERNS.disco;
}
