import { describe, expect, it } from 'vitest';
import { getOptimizationArchitecture, getOptimizationCategory } from './category-registry.js';

describe('optimization category registry', () => {
  it('registers the parametric_eq category with multiple architectures', () => {
    const category = getOptimizationCategory('parametric_eq');

    expect(category.label).toBe('Parametric EQ');
    expect(category.architectures.length).toBeGreaterThanOrEqual(3);
    expect(category.targetIds).toContain('warmth');
  });

  it('resolves individual architecture definitions', () => {
    const architecture = getOptimizationArchitecture('parametric_eq', 'eq_tilt_presence');

    expect(architecture.family).toBe('tilt_presence_eq');
    expect(architecture.parameterRanges.some((range) => range.id === 'tilt_amount_db')).toBe(true);
  });

  it('registers the delay_echo category with multiple architectures', () => {
    const category = getOptimizationCategory('delay_echo');

    expect(category.label).toBe('Delay Echo');
    expect(category.architectures.length).toBeGreaterThanOrEqual(2);
    expect(category.targetIds).toContain('time');
  });
});
