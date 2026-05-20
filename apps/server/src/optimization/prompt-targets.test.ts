import { describe, expect, it } from 'vitest';
import { inferParametricEqTargetsFromPrompt } from './prompt-targets.js';

describe('inferParametricEqTargetsFromPrompt', () => {
  it('keeps EQ as one category but captures structural constraints', () => {
    const vector = inferParametricEqTargetsFromPrompt('Generate a mid-side parametric EQ with stereo width control');

    expect(vector.category).toBe('parametric_eq');
    expect(vector.family).toBe('clean_parametric_eq');
    expect(vector.constraints).toEqual({
      mode: 'mid_side',
      preferredBandCount: 5,
      requireQControl: true,
      requestedStereoWidthControl: true,
    });
  });

  it('allows broader musical EQ prompts to stay flexible', () => {
    const vector = inferParametricEqTargetsFromPrompt('warm analog mastering eq with air');

    expect(vector.category).toBe('parametric_eq');
    expect(vector.constraints).toEqual({
      mode: 'stereo',
      preferredBandCount: 3,
      requireQControl: false,
      requestedStereoWidthControl: false,
    });
  });
});
