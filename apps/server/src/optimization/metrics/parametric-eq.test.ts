import { describe, expect, it } from 'vitest';
import { buildParametricEqOptimizerJob } from '../orchestrator.js';
import { buildParametricEqSpec } from '../emit.js';
import { evaluateParametricEqCandidate } from './parametric-eq.js';
import { emitFaustFromSpec } from '../../faust/spec-runtime.js';

describe('evaluateParametricEqCandidate', () => {
  it('produces weighted metric scores for a candidate/spec pair', () => {
    const job = buildParametricEqOptimizerJob({
      prompt: 'warm analog mastering eq with air',
    });
    const candidate = {
      architectureId: job.architectureId,
      params: Object.fromEntries(job.parameterRanges.map((range) => [range.id, range.initial])),
      score: 0,
      metrics: [],
    };
    const spec = buildParametricEqSpec({
      prompt: 'warm analog mastering eq with air',
      target: job.target,
      candidate,
    });
    const metrics = evaluateParametricEqCandidate({
      spec,
      faustCode: emitFaustFromSpec(spec),
      target: job.target,
      candidate,
      metricWeights: job.metricWeights,
    });

    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.every((metric) => metric.weight > 0)).toBe(true);
    expect(metrics.every((metric) => metric.value >= 0 && metric.value <= 1)).toBe(true);
  });
});
