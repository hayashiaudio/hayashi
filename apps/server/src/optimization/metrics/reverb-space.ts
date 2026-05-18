import { evaluateFaustSpec } from '../../faust/measurement.js';
import type { PluginSpec } from '../../faust/spec-runtime.js';
import type { OptimizationCandidateResult, OptimizationMetricScore, OptimizationTargetVector } from '../contracts.js';
import { average, clamp01, normalizedDistance } from './base.js';

export function evaluateReverbSpaceCandidate(args: {
  spec: PluginSpec;
  faustCode: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
  metricWeights: Record<string, number>;
}): OptimizationMetricScore[] {
  const measurement = evaluateFaustSpec(args.spec, args.faustCode);
  const target = args.target.values;
  const params = args.candidate.params;

  const sizeShape = clamp01(params.space_amt ?? 0.5);
  const densityShape = clamp01((params.diffusion_amt ?? 0.5) * 0.7 + (params.bloom_amt ?? 0.5) * 0.3);
  const darknessShape = clamp01((params.damping_amt ?? params.feedback_tone_amt ?? 0.4) * 0.85);
  const bloomShape = clamp01(params.bloom_amt ?? 0.5);
  const modulationShape = clamp01(((params.mod_depth_amt ?? 0) * 0.7) + ((params.mod_rate_amt ?? params.movement_amt ?? 0) * 0.3));
  const predelayShape = clamp01(params.predelay_amt ?? 0.2);
  const widthTarget = target.width > 0.65 ? 0.3 : 0.55;

  const measuredDarkness = clamp01(1 - ((measurement.metrics.spectralCentroidHz - 450) / (5600 - 450)));
  const measuredSize = clamp01((measurement.metrics.decayMs - 500) / (5000 - 500));
  const measuredWidth = clamp01(1 - Math.abs(measurement.metrics.stereoCorrelation - widthTarget) / 0.7);

  const rawMetrics: Record<string, number> = {
    size_match: average([
      normalizedDistance(sizeShape, target.size),
      normalizedDistance(measuredSize, target.size),
      normalizedDistance(predelayShape, target.predelay * 0.65 + target.transient_preservation * 0.35),
    ]),
    density_profile: average([
      normalizedDistance(densityShape, target.density),
      normalizedDistance(clamp01(measurement.metrics.complexityScore), target.density * 0.55 + 0.35),
    ]),
    spectral_darkness_match: average([
      normalizedDistance(darknessShape, target.darkness),
      normalizedDistance(measuredDarkness, target.darkness),
    ]),
    bloom_quality: average([
      normalizedDistance(bloomShape, target.bloom),
      normalizedDistance(measuredSize, target.bloom * 0.7 + target.size * 0.3),
    ]),
    transient_preservation: average([
      normalizedDistance(predelayShape, target.transient_preservation * 0.7 + target.predelay * 0.3),
      clamp01(1 - Math.abs(measurement.metrics.decayMs - (target.transient_preservation > 0.65 ? 1300 : 2600)) / 2600),
    ]),
    stereo_field: average([
      measuredWidth,
      normalizedDistance(clamp01(1 - measurement.metrics.stereoCorrelation), target.width),
    ]),
    modulation_coherence: normalizedDistance(modulationShape, target.modulation),
    mix_readiness: average([
      clamp01(1 - Math.abs(measurement.metrics.peakDb + 8) / 10),
      clamp01(1 - Math.abs(measurement.metrics.rms + 21) / 9),
      clamp01(1 - measurement.metrics.clippingRatio * 1.2),
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
