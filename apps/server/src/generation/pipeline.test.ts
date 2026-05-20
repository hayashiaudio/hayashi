import { describe, expect, it } from 'vitest';
import { buildAppGenerationPlan, isParametricEqPrompt } from './pipeline.js';

describe('isParametricEqPrompt', () => {
  it('detects explicit EQ prompts', () => {
    expect(isParametricEqPrompt('mid-side parametric EQ with stereo width control')).toBe(true);
    expect(isParametricEqPrompt('warm airy vocal eq with forward presence')).toBe(true);
    expect(isParametricEqPrompt('5-band equalizer for mastering')).toBe(true);
  });

  it('does not treat synth prompts as EQ prompts', () => {
    expect(isParametricEqPrompt('wide ambient pad with movement')).toBe(false);
    expect(isParametricEqPrompt('cinematic supersaw lead with reverb')).toBe(false);
  });
});

describe('buildAppGenerationPlan', () => {
  it('routes EQ prompts to the optimizer pipeline', () => {
    expect(buildAppGenerationPlan('mid-side parametric EQ with stereo width control')).toEqual({
      pipeline: 'parametric_eq_optimizer',
      pluginType: 'effect',
    });
  });

  it('falls back to the legacy classifier for non-EQ prompts', () => {
    expect(buildAppGenerationPlan('wide ambient pad with movement')).toEqual({
      pipeline: 'legacy',
      pluginType: 'synth',
    });
  });
});
