import type { OptimizationCategory } from './contracts.js';

export interface OptimizationCorpusItem {
  id: string;
  label: string;
  description: string;
}

const PARAMETRIC_EQ_CORPUS: OptimizationCorpusItem[] = [
  { id: 'eq-vocal', label: 'Vocal', description: 'Forward vocal presence and intelligibility checks' },
  { id: 'eq-drums', label: 'Drums', description: 'Transient clarity and low-end weight checks' },
  { id: 'eq-bass', label: 'Bass', description: 'Low-end preservation and mid focus checks' },
  { id: 'eq-pad', label: 'Pad', description: 'Air and smoothness checks on sustained material' },
  { id: 'eq-guitar', label: 'Guitar', description: 'Midrange bite and top-end harshness checks' },
  { id: 'eq-bus', label: 'Mix Bus', description: 'Broad tonal shaping and trim stability checks' },
  { id: 'eq-sweep', label: 'Sweep', description: 'Synthetic sweep fixture for broad response checks' },
  { id: 'eq-impulse', label: 'Impulse', description: 'Impulse fixture for fast topology and stability checks' },
  { id: 'eq-analysis', label: 'Analysis Sweep', description: 'Legacy synthetic analysis fixture for broad response checks' },
];

const SYNTH_CORPUS: OptimizationCorpusItem[] = [
  { id: 'synth-bass', label: 'Bass Line', description: 'Low-end weight and mono focus checks' },
  { id: 'synth-pad', label: 'Pad Chords', description: 'Width, space, and modulation checks' },
  { id: 'synth-pluck', label: 'Pluck Pattern', description: 'Transient and decay behavior checks' },
  { id: 'synth-lead', label: 'Lead Phrase', description: 'Pitch glide and expressive movement checks' },
  { id: 'synth-impulse', label: 'Impulse', description: 'Fast stability and envelope-shape analysis' },
  { id: 'synth-sweep', label: 'Sweep', description: 'Spectral and filter motion analysis' },
];

const REVERB_SPACE_CORPUS: OptimizationCorpusItem[] = [
  { id: 'verb-vocal', label: 'Vocal Send', description: 'Onset separation and halo shape on vocals' },
  { id: 'verb-snare', label: 'Snare Send', description: 'Transient preservation and tail density checks' },
  { id: 'verb-pad', label: 'Pad Wash', description: 'Width, darkness, and long-tail smoothness checks' },
  { id: 'verb-pluck', label: 'Pluck Send', description: 'Predelay clarity and early bloom checks' },
  { id: 'verb-bus', label: 'Bus Send', description: 'Mix-readiness and stereo stability checks' },
  { id: 'verb-impulse', label: 'Impulse', description: 'Decay shape and topology stability checks' },
];

const DELAY_ECHO_CORPUS: OptimizationCorpusItem[] = [
  { id: 'delay-drums', label: 'Drum Loop', description: 'Rhythmic repeat clarity and tail containment checks' },
  { id: 'delay-vocal', label: 'Vocal Phrase', description: 'Intelligibility and echo darkness checks' },
  { id: 'delay-pluck', label: 'Pluck Phrase', description: 'Transient-to-repeat separation checks' },
  { id: 'delay-pad', label: 'Pad Texture', description: 'Diffuse tail and width checks' },
  { id: 'delay-bus', label: 'Bus Send', description: 'Mix-readiness and repeat density checks' },
  { id: 'delay-impulse', label: 'Impulse', description: 'Echo spacing and stability checks' },
];

export function getCorpusForCategory(category: OptimizationCategory): OptimizationCorpusItem[] {
  switch (category) {
    case 'parametric_eq':
      return PARAMETRIC_EQ_CORPUS;
    case 'synth':
      return SYNTH_CORPUS;
    case 'reverb_space':
      return REVERB_SPACE_CORPUS;
    case 'delay_echo':
      return DELAY_ECHO_CORPUS;
  }
}
