import {
  createParametricEqTargetVector,
  createDelayEchoTargetVector,
  createReverbSpaceTargetVector,
  createSynthTargetVector,
  type DelayEchoTargetId,
  type ParametricEqTargetId,
  type ReverbSpaceTargetId,
  type SynthTargetId,
} from './targets.js';
import type { OptimizationTargetVector } from './contracts.js';

const KEYWORD_INFLUENCES: Array<{ pattern: RegExp; updates: Partial<Record<ParametricEqTargetId, number>> }> = [
  { pattern: /\bwarm|\bvintage|\banalog\b/i, updates: { warmth: 0.75, color: 0.7, smoothness: 0.65, precision: 0.35 } },
  { pattern: /\bair|\bairy|\bopen\b/i, updates: { air: 0.8, clarity: 0.65 } },
  { pattern: /\bclean|\bsurgical|\bprecise\b/i, updates: { precision: 0.85, color: 0.2, resonance: 0.3 } },
  { pattern: /\bdark|\bsoft\b/i, updates: { air: 0.2, warmth: 0.65, smoothness: 0.7 } },
  { pattern: /\bbright|\bforward|\bpresent\b/i, updates: { air: 0.7, forwardness: 0.75, clarity: 0.7 } },
  { pattern: /\bweight|\bthick|\blow end|\bbass\b/i, updates: { weight: 0.8, warmth: 0.65 } },
  { pattern: /\bresonant|\bcharacter|\bcolor\b/i, updates: { resonance: 0.75, color: 0.8, precision: 0.3 } },
];

function mergeTargets(base: Record<ParametricEqTargetId, number>, updates: Partial<Record<ParametricEqTargetId, number>>) {
  for (const [key, value] of Object.entries(updates)) {
    base[key as ParametricEqTargetId] = value as number;
  }
}

export function inferParametricEqTargetsFromPrompt(prompt: string): OptimizationTargetVector {
  const lowered = prompt.trim();
  const values = {
    warmth: 0.5,
    air: 0.5,
    clarity: 0.5,
    weight: 0.5,
    forwardness: 0.5,
    smoothness: 0.5,
    precision: 0.5,
    color: 0.5,
    resonance: 0.5,
  } satisfies Record<ParametricEqTargetId, number>;

  for (const influence of KEYWORD_INFLUENCES) {
    if (influence.pattern.test(lowered)) {
      mergeTargets(values, influence.updates);
    }
  }

  let family = 'musical_tone_eq';
  if (/\btilt|\bmaster|\bbus\b/i.test(lowered)) family = 'tilt_presence_eq';
  if (/\bsurgical|\bnotch|\bcorrective\b/i.test(lowered)) family = 'clean_parametric_eq';
  if (/\bresonant|\bcreative|\btexture\b/i.test(lowered)) family = 'resonant_texture_eq';

  return createParametricEqTargetVector(values, family);
}

const SYNTH_KEYWORD_INFLUENCES: Array<{ pattern: RegExp; updates: Partial<Record<SynthTargetId, number>> }> = [
  { pattern: /\bbass|\bsub|\b808\b/i, updates: { body: 0.85, punch: 0.75, brightness: 0.3, width: 0.2 } },
  { pattern: /\bpad|\batmos|\bambient\b/i, updates: { space: 0.85, width: 0.8, smoothness: 0.8, movement: 0.6 } },
  { pattern: /\bpluck|\bpluckish|\bmallet\b/i, updates: { punch: 0.8, brightness: 0.7, space: 0.35, glide: 0.05 } },
  { pattern: /\blead|\bsolo|\bmono\b/i, updates: { character: 0.75, glide: 0.65, punch: 0.6 } },
  { pattern: /\bbright|\bshimmer|\bairy\b/i, updates: { brightness: 0.8, width: 0.65 } },
  { pattern: /\bdark|\bwarm|\bsoft\b/i, updates: { brightness: 0.25, body: 0.7, smoothness: 0.75 } },
  { pattern: /\bmovement|\banimated|\bvibrato|\bmodulated\b/i, updates: { movement: 0.8, width: 0.6 } },
  { pattern: /\bglide|\bporta|\bportamento\b/i, updates: { glide: 0.85 } },
  { pattern: /\bdirty|\bdriven|\bsaturated\b/i, updates: { character: 0.85, punch: 0.65, smoothness: 0.3 } },
];

function mergeSynthTargets(base: Record<SynthTargetId, number>, updates: Partial<Record<SynthTargetId, number>>) {
  for (const [key, value] of Object.entries(updates)) {
    base[key as SynthTargetId] = value as number;
  }
}

export function inferSynthTargetsFromPrompt(prompt: string): OptimizationTargetVector {
  const lowered = prompt.trim();
  const values = {
    brightness: 0.5,
    body: 0.5,
    movement: 0.5,
    width: 0.5,
    punch: 0.5,
    character: 0.5,
    space: 0.5,
    smoothness: 0.5,
    glide: 0.2,
  } satisfies Record<SynthTargetId, number>;

  for (const influence of SYNTH_KEYWORD_INFLUENCES) {
    if (influence.pattern.test(lowered)) {
      mergeSynthTargets(values, influence.updates);
    }
  }

  let family = 'mono_bass';
  if (/\bpad|\batmos|\bambient\b/i.test(lowered)) family = 'supersaw_pad';
  else if (/\bpluck|\bmallet\b/i.test(lowered)) family = 'velvet_pluck';
  else if (/\blead|\bsolo\b/i.test(lowered)) family = 'stereo_lead';

  return createSynthTargetVector(values, family);
}

const REVERB_KEYWORD_INFLUENCES: Array<{ pattern: RegExp; updates: Partial<Record<ReverbSpaceTargetId, number>> }> = [
  { pattern: /\bplate|\bbright|\bmetallic\b/i, updates: { size: 0.55, density: 0.7, darkness: 0.2, bloom: 0.5, transient_preservation: 0.65 } },
  { pattern: /\bhall|\bcathedral|\bcinematic\b/i, updates: { size: 0.9, density: 0.78, bloom: 0.75, width: 0.72, predelay: 0.55 } },
  { pattern: /\bdark|\bshadow|\bambient\b/i, updates: { darkness: 0.82, modulation: 0.58, bloom: 0.62, transient_preservation: 0.35 } },
  { pattern: /\bmodulated|\bmotion|\banimated\b/i, updates: { modulation: 0.82, width: 0.7, density: 0.65 } },
  { pattern: /\bwide|\bstereo|\bimmersive\b/i, updates: { width: 0.82, size: 0.72 } },
  { pattern: /\bpredelay|\bseparation|\btransient\b/i, updates: { predelay: 0.8, transient_preservation: 0.8 } },
  { pattern: /\bdense|\bsmooth|\blush\b/i, updates: { density: 0.84, bloom: 0.72, darkness: 0.45 } },
  { pattern: /\bshort|\btight|\broom\b/i, updates: { size: 0.3, bloom: 0.28, predelay: 0.2, transient_preservation: 0.72 } },
];

function mergeReverbTargets(base: Record<ReverbSpaceTargetId, number>, updates: Partial<Record<ReverbSpaceTargetId, number>>) {
  for (const [key, value] of Object.entries(updates)) {
    base[key as ReverbSpaceTargetId] = value as number;
  }
}

export function inferReverbSpaceTargetsFromPrompt(prompt: string): OptimizationTargetVector {
  const lowered = prompt.trim();
  const values = {
    size: 0.6,
    density: 0.6,
    darkness: 0.45,
    bloom: 0.55,
    modulation: 0.35,
    width: 0.6,
    predelay: 0.35,
    transient_preservation: 0.5,
  } satisfies Record<ReverbSpaceTargetId, number>;

  for (const influence of REVERB_KEYWORD_INFLUENCES) {
    if (influence.pattern.test(lowered)) {
      mergeReverbTargets(values, influence.updates);
    }
  }

  let family = 'hall_bloom';
  if (/\bplate|\bbright\b/i.test(lowered)) family = 'plate_space';
  else if (/\bdark|\bshadow|\bambient\b/i.test(lowered)) family = 'dark_motion_verb';
  else if (/\bmodulated|\becho|\brhythmic\b/i.test(lowered)) family = 'modulated_echo_verb';

  return createReverbSpaceTargetVector(values, family);
}

const DELAY_KEYWORD_INFLUENCES: Array<{ pattern: RegExp; updates: Partial<Record<DelayEchoTargetId, number>> }> = [
  { pattern: /\btempo|\brhythmic|\bpulsing\b/i, updates: { rhythmicity: 0.85, time: 0.45, mix_clarity: 0.7 } },
  { pattern: /\blong|\bwash|\batmospheric\b/i, updates: { time: 0.82, feedback: 0.72, diffusion: 0.62, mix_clarity: 0.35 } },
  { pattern: /\bshort|\bslap|\btight\b/i, updates: { time: 0.22, feedback: 0.28, rhythmicity: 0.72, mix_clarity: 0.8 } },
  { pattern: /\bdark|\btape|\bwarm\b/i, updates: { darkness: 0.78, modulation: 0.38, mix_clarity: 0.48 } },
  { pattern: /\bbright|\bclean|\bdigital\b/i, updates: { darkness: 0.2, mix_clarity: 0.82, rhythmicity: 0.75 } },
  { pattern: /\bwide|\bstereo|\bping\b/i, updates: { width: 0.82, modulation: 0.45 } },
  { pattern: /\bmodulated|\bwobble|\banimated\b/i, updates: { modulation: 0.82, diffusion: 0.55, rhythmicity: 0.45 } },
  { pattern: /\bdiffuse|\bsmeared|\bcloud\b/i, updates: { diffusion: 0.82, feedback: 0.62, mix_clarity: 0.3 } },
];

function mergeDelayTargets(base: Record<DelayEchoTargetId, number>, updates: Partial<Record<DelayEchoTargetId, number>>) {
  for (const [key, value] of Object.entries(updates)) {
    base[key as DelayEchoTargetId] = value as number;
  }
}

export function inferDelayEchoTargetsFromPrompt(prompt: string): OptimizationTargetVector {
  const lowered = prompt.trim();
  const values = {
    time: 0.5,
    feedback: 0.5,
    darkness: 0.4,
    width: 0.5,
    modulation: 0.25,
    rhythmicity: 0.65,
    diffusion: 0.3,
    mix_clarity: 0.6,
  } satisfies Record<DelayEchoTargetId, number>;

  for (const influence of DELAY_KEYWORD_INFLUENCES) {
    if (influence.pattern.test(lowered)) {
      mergeDelayTargets(values, influence.updates);
    }
  }

  let family = 'tempo_echo';
  if (/\bmodulated|\bwobble|\banimated|\bcloud\b/i.test(lowered)) family = 'modulated_echo_delay';

  return createDelayEchoTargetVector(values, family);
}
