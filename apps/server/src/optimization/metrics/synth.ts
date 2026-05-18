import { evaluateFaustSpec } from '../../faust/measurement.js';
import type { PluginSpec } from '../../faust/spec-runtime.js';
import type { OptimizationCandidateResult, OptimizationMetricScore, OptimizationTargetVector } from '../contracts.js';
import { average, clamp01, normalizedDistance } from './base.js';

export function evaluateSynthCandidate(args: {
  spec: PluginSpec;
  faustCode: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
  metricWeights: Record<string, number>;
}): OptimizationMetricScore[] {
  const measurement = evaluateFaustSpec(args.spec, args.faustCode);
  const target = args.target.values;
  const params = args.candidate.params;

  const brightnessShape = clamp01(((params.cutoff_hz ?? 2000) - 80) / (12000 - 80));
  const bodyShape = clamp01(1 - (((params.cutoff_hz ?? 2000) - 80) / (12000 - 80)) * 0.5 + (params.drive_amt ?? 0) * 0.15);
  const movementShape = clamp01(((params.vibrato_depth ?? params.lfo_depth ?? 0) * 8) + ((params.vibrato_rate ?? params.lfo_rate ?? 0.3) / 10) * 0.25);
  const widthShape = clamp01((params.width_amt ?? params.detune ?? 0) * 1.1);
  const punchShape = clamp01(1 - ((params.attack_s ?? params.decay_s ?? 0.1) / 2.5) * 0.7 + (params.drive_amt ?? 0) * 0.15);
  const characterShape = clamp01((params.drive_amt ?? params.detune ?? 0) * 0.7 + (params.resonance ?? params.brightness_q ?? 0.4) * 0.25);
  const glideShape = clamp01((params.glide_time ?? 0) / 0.7);
  const peakDb = measurement.metrics.peakDb;
  const rms = measurement.metrics.rms;

  const rawMetrics: Record<string, number> = {
    target_tone_fit: average([
      normalizedDistance(brightnessShape, target.brightness),
      normalizedDistance(bodyShape, target.body),
      normalizedDistance(characterShape, target.character),
    ]),
    motion_richness: average([
      normalizedDistance(movementShape, target.movement),
      normalizedDistance(widthShape, target.width * 0.8 + target.space * 0.2),
    ]),
    transient_shape: average([
      normalizedDistance(punchShape, target.punch),
      normalizedDistance(clamp01((params.release_s ?? 0.3) / 4.5), target.space * 0.5 + target.smoothness * 0.5),
    ]),
    glide_behavior: normalizedDistance(glideShape, target.glide),
    harmonic_character: average([
      normalizedDistance(characterShape, target.character),
      normalizedDistance(bodyShape, target.smoothness * 0.35 + target.body * 0.65),
    ]),
    output_stability: clamp01(1 - Math.abs(peakDb + 6) / 12),
    stereo_width_proxy: normalizedDistance(widthShape, target.width),
    mix_readiness: average([
      clamp01(1 - Math.abs(rms + 18) / 10),
      clamp01(1 - Math.abs(measurement.metrics.stereoCorrelation - (target.width > 0.6 ? 0.45 : 0.75)) * 0.7),
    ]),
  };

  return Object.entries(args.metricWeights).map(([metricId, weight]) => {
    const value = clamp01(rawMetrics[metricId] ?? 0);
    return {
      metricId,
      value,
      weight,
      weightedScore: value * weight,
    };
  });
}
