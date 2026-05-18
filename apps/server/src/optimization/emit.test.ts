import { describe, expect, it } from 'vitest';
import { buildDelayEchoOptimizerJob, buildParametricEqOptimizerJob, buildReverbSpaceOptimizerJob, buildSynthOptimizerJob } from './orchestrator.js';
import { emitDelayEchoArtifacts, emitParametricEqArtifacts, emitReverbSpaceArtifacts, emitSynthArtifacts } from './emit.js';

describe('emitParametricEqArtifacts', () => {
  it('emits valid artifacts from an optimizer candidate', () => {
    const job = buildParametricEqOptimizerJob({
      prompt: 'warm analog mastering eq with air',
    });

    const candidate = {
      architectureId: job.architectureId,
      params: Object.fromEntries(job.parameterRanges.map((range) => [range.id, range.initial])),
      score: 0,
      metrics: [],
    };

    const result = emitParametricEqArtifacts({
      prompt: 'warm analog mastering eq with air',
      target: job.target,
      candidate,
    });

    expect(result.spec.kind).toBe('effect');
    expect(result.spec.voiceArchitecture).toBe(job.architectureId);
    expect(result.faustCode).toContain('import("stdfaust.lib");');
    expect(result.uiSpec.uiFamily).toBe('color_fx');
    expect(result.uiSpec.visualizers.some((visualizer) => visualizer.type === 'filter_curve')).toBe(true);
    expect(result.macroControls.length).toBeGreaterThan(0);
  });
});

describe('emitSynthArtifacts', () => {
  it('emits valid synth artifacts from an optimizer candidate', () => {
    const job = buildSynthOptimizerJob({
      prompt: 'gliding stereo lead with vibrato and width',
      maxEvaluations: 8,
    });

    const candidate = {
      architectureId: job.architectureId,
      params: Object.fromEntries(job.parameterRanges.map((range) => [range.id, range.initial])),
      score: 0,
      metrics: [],
    };

    const result = emitSynthArtifacts({
      prompt: 'gliding stereo lead with vibrato and width',
      target: job.target,
      candidate,
    });

    expect(result.spec.kind).toBe('synth');
    expect(result.spec.voiceArchitecture).toBe('custom_graph');
    expect(result.faustCode).toContain('import("stdfaust.lib");');
    expect(result.uiSpec.uiFamily).toBe('instrument_modern');
    expect(result.macroControls.length).toBeGreaterThan(0);
    expect(result.parameterSchema.length).toBeGreaterThan(0);
  });
});

describe('emitReverbSpaceArtifacts', () => {
  it('emits valid reverb artifacts from an optimizer candidate', () => {
    const job = buildReverbSpaceOptimizerJob({
      prompt: 'dark modulated ambient reverb with bloom',
      maxEvaluations: 8,
    });

    const candidate = {
      architectureId: job.architectureId,
      params: Object.fromEntries(job.parameterRanges.map((range) => [range.id, range.initial])),
      score: 0,
      metrics: [],
    };

    const result = emitReverbSpaceArtifacts({
      prompt: 'dark modulated ambient reverb with bloom',
      target: job.target,
      candidate,
    });

    expect(result.spec.kind).toBe('effect');
    expect(result.spec.voiceArchitecture).toBe(job.architectureId);
    expect(result.faustCode).toContain('import("stdfaust.lib");');
    expect(result.uiSpec.uiFamily).toBe('space_fx');
    expect(result.uiSpec.visualizers.some((visualizer) => visualizer.type === 'decay_meter')).toBe(true);
    expect(result.macroControls.length).toBeGreaterThan(0);
    expect(result.parameterSchema.length).toBeGreaterThan(0);
  });
});

describe('emitDelayEchoArtifacts', () => {
  it('emits valid delay artifacts from an optimizer candidate', () => {
    const job = buildDelayEchoOptimizerJob({
      prompt: 'wide dark modulated delay with rhythmic repeats',
      maxEvaluations: 8,
    });

    const candidate = {
      architectureId: job.architectureId,
      params: Object.fromEntries(job.parameterRanges.map((range) => [range.id, range.initial])),
      score: 0,
      metrics: [],
    };

    const result = emitDelayEchoArtifacts({
      prompt: 'wide dark modulated delay with rhythmic repeats',
      target: job.target,
      candidate,
    });

    expect(result.spec.kind).toBe('effect');
    expect(result.faustCode).toContain('import("stdfaust.lib");');
    expect(result.uiSpec.uiFamily).toBe('color_fx');
    expect(result.macroControls.length).toBeGreaterThan(0);
    expect(result.parameterSchema.length).toBeGreaterThan(0);
  });
});
