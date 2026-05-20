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
  const averageParam = (left: string, right: string) => ((params[left] ?? 0) + (params[right] ?? 0)) * 0.5;

  const lowShape = clamp01((averageParam('mid_band1_gain_db', 'side_band1_gain_db') + 15) / 30);
  const midShape = clamp01((averageParam('mid_band3_gain_db', 'side_band3_gain_db') + 15) / 30);
  const highShape = clamp01((averageParam('mid_band4_gain_db', 'side_band4_gain_db') + 15) / 30);
  const airShape = clamp01((averageParam('mid_band5_gain_db', 'side_band5_gain_db') + 15) / 30);
  const trimShape = clamp01(1 - Math.abs(params.trim_db ?? 0) / 6);
  const qBias = clamp01((
    (
      (params.mid_band1_q ?? 0.8)
      + (params.mid_band2_q ?? 1.1)
      + (params.mid_band3_q ?? 1.3)
      + (params.mid_band4_q ?? 1.5)
      + (params.mid_band5_q ?? 0.9)
      + (params.side_band1_q ?? 0.8)
      + (params.side_band2_q ?? 1.1)
      + (params.side_band3_q ?? 1.3)
      + (params.side_band4_q ?? 1.5)
      + (params.side_band5_q ?? 0.9)
    ) / 10
  ) / 4);

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
