import type { OptimizationTargetVector } from './contracts.js';

export const PARAMETRIC_EQ_TARGET_IDS = [
  'warmth',
  'air',
  'clarity',
  'weight',
  'forwardness',
  'smoothness',
  'precision',
  'color',
  'resonance',
] as const;

export type ParametricEqTargetId = typeof PARAMETRIC_EQ_TARGET_IDS[number];

export const DEFAULT_PARAMETRIC_EQ_TARGETS: Record<ParametricEqTargetId, number> = {
  warmth: 0.5,
  air: 0.5,
  clarity: 0.5,
  weight: 0.5,
  forwardness: 0.5,
  smoothness: 0.5,
  precision: 0.5,
  color: 0.5,
  resonance: 0.5,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function normalizeParametricEqTargets(values: Partial<Record<ParametricEqTargetId, number>>): Record<ParametricEqTargetId, number> {
  const normalized = { ...DEFAULT_PARAMETRIC_EQ_TARGETS };
  for (const id of PARAMETRIC_EQ_TARGET_IDS) {
    if (id in values && values[id] !== undefined) {
      normalized[id] = clamp01(values[id] as number);
    }
  }
  return normalized;
}

export function createParametricEqTargetVector(
  values: Partial<Record<ParametricEqTargetId, number>>,
  family = 'musical_tone_eq',
  constraints?: OptimizationTargetVector['constraints'],
): OptimizationTargetVector {
  return {
    category: 'parametric_eq',
    family,
    values: normalizeParametricEqTargets(values),
    constraints,
  };
}

export const SYNTH_TARGET_IDS = [
  'brightness',
  'body',
  'movement',
  'width',
  'punch',
  'character',
  'space',
  'smoothness',
  'glide',
] as const;

export type SynthTargetId = typeof SYNTH_TARGET_IDS[number];

export const DEFAULT_SYNTH_TARGETS: Record<SynthTargetId, number> = {
  brightness: 0.5,
  body: 0.5,
  movement: 0.5,
  width: 0.5,
  punch: 0.5,
  character: 0.5,
  space: 0.5,
  smoothness: 0.5,
  glide: 0.2,
};

export function normalizeSynthTargets(values: Partial<Record<SynthTargetId, number>>): Record<SynthTargetId, number> {
  const normalized = { ...DEFAULT_SYNTH_TARGETS };
  for (const id of SYNTH_TARGET_IDS) {
    if (id in values && values[id] !== undefined) {
      normalized[id] = clamp01(values[id] as number);
    }
  }
  return normalized;
}

export function createSynthTargetVector(
  values: Partial<Record<SynthTargetId, number>>,
  family = 'mono_bass',
): OptimizationTargetVector {
  return {
    category: 'synth',
    family,
    values: normalizeSynthTargets(values),
  };
}

export const REVERB_SPACE_TARGET_IDS = [
  'size',
  'density',
  'darkness',
  'bloom',
  'modulation',
  'width',
  'predelay',
  'transient_preservation',
] as const;

export type ReverbSpaceTargetId = typeof REVERB_SPACE_TARGET_IDS[number];

export const DEFAULT_REVERB_SPACE_TARGETS: Record<ReverbSpaceTargetId, number> = {
  size: 0.6,
  density: 0.6,
  darkness: 0.45,
  bloom: 0.55,
  modulation: 0.35,
  width: 0.6,
  predelay: 0.35,
  transient_preservation: 0.5,
};

export function normalizeReverbSpaceTargets(values: Partial<Record<ReverbSpaceTargetId, number>>): Record<ReverbSpaceTargetId, number> {
  const normalized = { ...DEFAULT_REVERB_SPACE_TARGETS };
  for (const id of REVERB_SPACE_TARGET_IDS) {
    if (id in values && values[id] !== undefined) {
      normalized[id] = clamp01(values[id] as number);
    }
  }
  return normalized;
}

export function createReverbSpaceTargetVector(
  values: Partial<Record<ReverbSpaceTargetId, number>>,
  family = 'hall_bloom',
): OptimizationTargetVector {
  return {
    category: 'reverb_space',
    family,
    values: normalizeReverbSpaceTargets(values),
  };
}

export const DELAY_ECHO_TARGET_IDS = [
  'time',
  'feedback',
  'darkness',
  'width',
  'modulation',
  'rhythmicity',
  'diffusion',
  'mix_clarity',
] as const;

export type DelayEchoTargetId = typeof DELAY_ECHO_TARGET_IDS[number];

export const DEFAULT_DELAY_ECHO_TARGETS: Record<DelayEchoTargetId, number> = {
  time: 0.5,
  feedback: 0.5,
  darkness: 0.4,
  width: 0.5,
  modulation: 0.25,
  rhythmicity: 0.65,
  diffusion: 0.3,
  mix_clarity: 0.6,
};

export function normalizeDelayEchoTargets(values: Partial<Record<DelayEchoTargetId, number>>): Record<DelayEchoTargetId, number> {
  const normalized = { ...DEFAULT_DELAY_ECHO_TARGETS };
  for (const id of DELAY_ECHO_TARGET_IDS) {
    if (id in values && values[id] !== undefined) {
      normalized[id] = clamp01(values[id] as number);
    }
  }
  return normalized;
}

export function createDelayEchoTargetVector(
  values: Partial<Record<DelayEchoTargetId, number>>,
  family = 'tempo_echo',
): OptimizationTargetVector {
  return {
    category: 'delay_echo',
    family,
    values: normalizeDelayEchoTargets(values),
  };
}
