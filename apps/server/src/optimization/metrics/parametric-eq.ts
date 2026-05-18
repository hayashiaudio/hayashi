import { evaluateFaustSpec } from '../../faust/measurement.js';
import type { PluginSpec } from '../../faust/spec-runtime.js';
import type { OptimizationCandidateResult, OptimizationMetricScore, OptimizationTargetVector } from '../contracts.js';
import { average, clamp01, normalizedDistance } from './base.js';

export function evaluateParametricEqCandidate(args: {
  spec: PluginSpec;
  faustCode: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
  metricWeights: Record<string, number>;
}): OptimizationMetricScore[] {
  const measurement = evaluateFaustSpec(args.spec, args.faustCode);
  const target = args.target.values;
  const params = args.candidate.params;

  const lowShape = clamp01(((params.low_gain_db ?? 0) + 12) / 24);
  const midShape = clamp01(((params.mid_gain_db ?? 0) + 12) / 24);
  const highShape = clamp01(((params.high_gain_db ?? 0) + 12) / 24);
  const airShape = clamp01(((params.air_gain_db ?? params.high_gain_db ?? 0) + 9) / 18);
  const trimShape = clamp01(1 - Math.abs(params.trim_db ?? 0) / 6);
  const qBias = clamp01((params.global_q_bias ?? params.resonant_q ?? params.mid_q ?? 1) / 4);

  const rawMetrics: Record<string, number> = {
    target_curve_fit: average([
      normalizedDistance(lowShape, target.weight * 0.7 + target.warmth * 0.3),
      normalizedDistance(midShape, target.clarity * 0.55 + target.color * 0.2),
      normalizedDistance(highShape, target.air * 0.7 + target.forwardness * 0.2),
    ]),
    band_interaction_smoothness: clamp01(1 - Math.abs(lowShape - midShape) * 0.45 - Math.abs(midShape - highShape) * 0.45),
    resonance_harshness_proxy: clamp01(1 - Math.max(0, qBias - (target.resonance * 0.9 + target.color * 0.2))),
    low_end_preservation: normalizedDistance(lowShape, target.weight),
    high_end_brittleness_proxy: clamp01(1 - Math.max(0, airShape - (target.air * 0.85 + target.smoothness * 0.25))),
    mono_compatibility: clamp01(1 - Math.abs(measurement.metrics.stereoCorrelation - 0.98) * 0.08),
    output_stability: clamp01(1 - Math.abs(measurement.metrics.peakDb + 6) / 12),
    gain_compensation_sanity: trimShape,
    colorfulness: normalizedDistance(clamp01((params.colorDrive ?? 0.02) / 0.2), target.color),
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
