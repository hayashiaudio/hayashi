import { describe, expect, it } from 'vitest';
import {
  createDelayEchoTargetVector,
  createParametricEqTargetVector,
  createReverbSpaceTargetVector,
  createSynthTargetVector,
  normalizeDelayEchoTargets,
  normalizeParametricEqTargets,
  normalizeReverbSpaceTargets,
  normalizeSynthTargets,
} from './targets.js';
import { inferDelayEchoTargetsFromPrompt, inferParametricEqTargetsFromPrompt, inferReverbSpaceTargetsFromPrompt, inferSynthTargetsFromPrompt } from './prompt-targets.js';

describe('parametric EQ targets', () => {
  it('clamps target values into the 0..1 range', () => {
    const normalized = normalizeParametricEqTargets({
      warmth: 2,
      air: -1,
      clarity: Number.NaN,
    });

    expect(normalized.warmth).toBe(1);
    expect(normalized.air).toBe(0);
    expect(normalized.clarity).toBe(0.5);
  });

  it('creates a stable target vector with defaults', () => {
    const vector = createParametricEqTargetVector({ warmth: 0.7 }, 'clean_parametric_eq');

    expect(vector.category).toBe('parametric_eq');
    expect(vector.family).toBe('clean_parametric_eq');
    expect(vector.values.warmth).toBe(0.7);
    expect(vector.values.air).toBe(0.5);
  });

  it('infers directional targets from prompt keywords', () => {
    const vector = inferParametricEqTargetsFromPrompt('warm analog mastering eq with air');

    expect(vector.family).toBe('tilt_presence_eq');
    expect(vector.values.warmth).toBeGreaterThan(0.5);
    expect(vector.values.color).toBeGreaterThan(0.5);
    expect(vector.values.air).toBeGreaterThan(0.5);
  });
});

describe('synth targets', () => {
  it('clamps synth target values into the 0..1 range', () => {
    const normalized = normalizeSynthTargets({
      brightness: 2,
      body: -1,
      glide: Number.NaN,
    });

    expect(normalized.brightness).toBe(1);
    expect(normalized.body).toBe(0);
    expect(normalized.glide).toBe(0.5);
  });

  it('creates a stable synth target vector with defaults', () => {
    const vector = createSynthTargetVector({ movement: 0.8 }, 'stereo_lead');

    expect(vector.category).toBe('synth');
    expect(vector.family).toBe('stereo_lead');
    expect(vector.values.movement).toBe(0.8);
    expect(vector.values.body).toBe(0.5);
  });

  it('infers synth target families from prompt keywords', () => {
    const vector = inferSynthTargetsFromPrompt('wide ambient pad with animated movement');

    expect(vector.family).toBe('supersaw_pad');
    expect(vector.values.width).toBeGreaterThan(0.5);
    expect(vector.values.space).toBeGreaterThan(0.5);
    expect(vector.values.movement).toBeGreaterThan(0.5);
  });
});

describe('reverb space targets', () => {
  it('clamps reverb target values into the 0..1 range', () => {
    const normalized = normalizeReverbSpaceTargets({
      size: 2,
      darkness: -1,
      bloom: Number.NaN,
    });

    expect(normalized.size).toBe(1);
    expect(normalized.darkness).toBe(0);
    expect(normalized.bloom).toBe(0.5);
  });

  it('creates a stable reverb target vector with defaults', () => {
    const vector = createReverbSpaceTargetVector({ modulation: 0.8 }, 'dark_motion_verb');

    expect(vector.category).toBe('reverb_space');
    expect(vector.family).toBe('dark_motion_verb');
    expect(vector.values.modulation).toBe(0.8);
    expect(vector.values.size).toBe(0.6);
  });

  it('infers reverb target families from prompt keywords', () => {
    const vector = inferReverbSpaceTargetsFromPrompt('dark modulated ambient reverb with bloom');

    expect(vector.family).toBe('dark_motion_verb');
    expect(vector.values.darkness).toBeGreaterThan(0.5);
    expect(vector.values.modulation).toBeGreaterThan(0.5);
    expect(vector.values.bloom).toBeGreaterThan(0.5);
  });
});

describe('delay echo targets', () => {
  it('clamps delay target values into the 0..1 range', () => {
    const normalized = normalizeDelayEchoTargets({
      time: 2,
      darkness: -1,
      width: Number.NaN,
    });

    expect(normalized.time).toBe(1);
    expect(normalized.darkness).toBe(0);
    expect(normalized.width).toBe(0.5);
  });

  it('creates a stable delay target vector with defaults', () => {
    const vector = createDelayEchoTargetVector({ modulation: 0.8 }, 'modulated_echo_delay');

    expect(vector.category).toBe('delay_echo');
    expect(vector.family).toBe('modulated_echo_delay');
    expect(vector.values.modulation).toBe(0.8);
    expect(vector.values.feedback).toBe(0.5);
  });

  it('infers delay target families from prompt keywords', () => {
    const vector = inferDelayEchoTargetsFromPrompt('wide dark modulated delay with rhythmic repeats');

    expect(vector.family).toBe('modulated_echo_delay');
    expect(vector.values.modulation).toBeGreaterThan(0.5);
    expect(vector.values.width).toBeGreaterThan(0.5);
    expect(vector.values.darkness).toBeGreaterThan(0.5);
  });
});
