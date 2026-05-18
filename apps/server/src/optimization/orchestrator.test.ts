import { describe, expect, it } from 'vitest';
import {
  buildDelayEchoOptimizerJob,
  buildParametricEqOptimizerJob,
  buildReverbSpaceOptimizerJob,
  buildSynthOptimizerJob,
  runDelayEchoOptimizationPass,
  runParametricEqOptimizationPass,
  runReverbSpaceOptimizationPass,
  runSynthOptimizationPass,
} from './orchestrator.js';

describe('buildParametricEqOptimizerJob', () => {
  it('builds a deterministic optimizer job from a prompt', () => {
    const first = buildParametricEqOptimizerJob({
      prompt: 'warm analog mastering eq with air',
    });
    const second = buildParametricEqOptimizerJob({
      prompt: 'warm analog mastering eq with air',
    });

    expect(first.category).toBe('parametric_eq');
    expect(first.architectureId).toBe('eq_tilt_presence');
    expect(first.seed).toBe(second.seed);
    expect(first.metricWeights.target_curve_fit).toBeGreaterThan(0);
    expect(first.corpusIds.length).toBeGreaterThan(0);
  });

  it('runs a full stubbed optimization pass to scored artifacts', async () => {
    const result = await runParametricEqOptimizationPass('warm analog mastering eq with air');

    expect(result.optimizer.winner.metrics.length).toBeGreaterThan(0);
    expect(result.score.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.artifacts.faustCode).toContain('import("stdfaust.lib");');
    expect(result.artifacts.uiSpec.uiFamily).toBe('color_fx');
    expect(result.optimizer.tracePath).toContain('optimization-traces');
  });
});

describe('buildSynthOptimizerJob', () => {
  it('builds a deterministic synth optimizer job from a prompt', () => {
    const first = buildSynthOptimizerJob({
      prompt: 'wide ambient pad with movement',
    });
    const second = buildSynthOptimizerJob({
      prompt: 'wide ambient pad with movement',
    });

    expect(first.category).toBe('synth');
    expect(first.architectureId).toBe('supersaw_pad');
    expect(first.seed).toBe(second.seed);
    expect(first.metricWeights.target_tone_fit).toBeGreaterThan(0);
    expect(first.corpusIds.length).toBeGreaterThan(0);
  });

  it('runs a full synth optimization pass to scored artifacts', async () => {
    const result = await runSynthOptimizationPass('gliding stereo lead with vibrato and width', { maxEvaluations: 8 });

    expect(result.optimizer.winner.metrics.length).toBeGreaterThan(0);
    expect(result.score.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.artifacts.faustCode).toContain('import("stdfaust.lib");');
    expect(result.artifacts.uiSpec.uiFamily).toBe('instrument_modern');
    expect(result.artifacts.spec.kind).toBe('synth');
    expect(result.optimizer.tracePath).toContain('optimization-traces');
  });
});

describe('buildReverbSpaceOptimizerJob', () => {
  it('builds a deterministic reverb optimizer job from a prompt', () => {
    const first = buildReverbSpaceOptimizerJob({
      prompt: 'dark modulated ambient reverb with bloom',
    });
    const second = buildReverbSpaceOptimizerJob({
      prompt: 'dark modulated ambient reverb with bloom',
    });

    expect(first.category).toBe('reverb_space');
    expect(first.architectureId).toBe('dark_motion_verb');
    expect(first.seed).toBe(second.seed);
    expect(first.metricWeights.size_match).toBeGreaterThan(0);
    expect(first.corpusIds.length).toBeGreaterThan(0);
  });

  it('runs a full reverb optimization pass to scored artifacts', async () => {
    const result = await runReverbSpaceOptimizationPass('dark modulated ambient reverb with bloom', { maxEvaluations: 8 });

    expect(result.optimizer.winner.metrics.length).toBeGreaterThan(0);
    expect(result.score.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.artifacts.faustCode).toContain('import("stdfaust.lib");');
    expect(result.artifacts.uiSpec.uiFamily).toBe('space_fx');
    expect(result.artifacts.spec.kind).toBe('effect');
    expect(result.optimizer.tracePath).toContain('optimization-traces');
  });
});

describe('buildDelayEchoOptimizerJob', () => {
  it('builds a deterministic delay optimizer job from a prompt', () => {
    const first = buildDelayEchoOptimizerJob({
      prompt: 'wide dark modulated delay with rhythmic repeats',
    });
    const second = buildDelayEchoOptimizerJob({
      prompt: 'wide dark modulated delay with rhythmic repeats',
    });

    expect(first.category).toBe('delay_echo');
    expect(first.architectureId).toBe('modulated_echo_delay');
    expect(first.seed).toBe(second.seed);
    expect(first.metricWeights.time_match).toBeGreaterThan(0);
    expect(first.corpusIds.length).toBeGreaterThan(0);
  });

  it('runs a full delay optimization pass to scored artifacts', async () => {
    const result = await runDelayEchoOptimizationPass('wide dark modulated delay with rhythmic repeats', { maxEvaluations: 8 });

    expect(result.optimizer.winner.metrics.length).toBeGreaterThan(0);
    expect(result.score.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.artifacts.faustCode).toContain('import("stdfaust.lib");');
    expect(result.artifacts.uiSpec.uiFamily).toBe('color_fx');
    expect(result.artifacts.spec.kind).toBe('effect');
    expect(result.optimizer.tracePath).toContain('optimization-traces');
  });
});
