import { describe, expect, it } from 'vitest';
import {
  getParametricEqBenchmarkCases,
  runParametricEqBenchmarkCase,
} from './parametric-eq.js';

describe('parametric EQ benchmarks', () => {
  it('defines a repeatable benchmark suite', () => {
    const benchmarks = getParametricEqBenchmarkCases();
    expect(benchmarks.length).toBeGreaterThanOrEqual(4);
    expect(benchmarks.some((benchmark) => benchmark.id === 'vocal-air')).toBe(true);
  });

  it('runs a benchmark case deterministically enough for smoke scoring', async () => {
    const benchmark = getParametricEqBenchmarkCases()[0];
    const result = await runParametricEqBenchmarkCase(benchmark, { maxEvaluations: 8 });

    expect(result.benchmark.id).toBe('vocal-air');
    expect(result.architectureId).toBe(benchmark.expectedArchitectureId);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.tracePath).toContain('optimization-traces');
  });
});
