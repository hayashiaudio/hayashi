import { evaluateFaustSpec } from '../../faust/measurement.js';
import type { PluginSpec } from '../../faust/spec-runtime.js';
import type { OptimizationCandidateResult, OptimizationMetricScore, OptimizationTargetVector } from '../contracts.js';
import { average, clamp01, normalizedDistance } from './base.js';

export function evaluateDelayEchoCandidate(args: {
  spec: PluginSpec;
  faustCode: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
  metricWeights: Record<string, number>;
}): OptimizationMetricScore[] {
  const measurement = evaluateFaustSpec(args.spec, args.faustCode);
  const target = args.target.values;
  const params = args.candidate.params;

  const timeShape = clamp01(params.time_amt ?? 0.5);
  const feedbackShape = clamp01(params.feedback_amt ?? 0.5);
  const darknessShape = clamp01(params.darkness_amt ?? 0.4);
  const widthShape = clamp01(params.width_amt ?? 0.5);
  const modulationShape = clamp01(((params.movement_amt ?? 0) * 0.6) + ((params.mod_depth_amt ?? 0) * 0.3) + ((params.mod_rate_amt ?? 0) * 0.1));
  const diffusionShape = clamp01(params.diffusion_amt ?? 0.3);
  const measuredDarkness = clamp01(1 - ((measurement.metrics.spectralCentroidHz - 600) / (5200 - 600)));
  const measuredDecay = clamp01((measurement.metrics.decayMs - 220) / (2600 - 220));
  const measuredWidth = clamp01(1 - Math.abs(measurement.metrics.stereoCorrelation - (target.width > 0.6 ? 0.38 : 0.66)) / 0.7);

  const rawMetrics: Record<string, number> = {
    time_match: average([
      normalizedDistance(timeShape, target.time),
      normalizedDistance(measuredDecay, target.time * 0.65 + target.feedback * 0.35),
    ]),
    feedback_contour: average([
      normalizedDistance(feedbackShape, target.feedback),
      normalizedDistance(measuredDecay, target.feedback * 0.7 + target.diffusion * 0.3),
    ]),
    tonal_decay_match: average([
      normalizedDistance(darknessShape, target.darkness),
      normalizedDistance(measuredDarkness, target.darkness),
    ]),
    stereo_spread: average([
      normalizedDistance(widthShape, target.width),
      measuredWidth,
    ]),
    modulation_coherence: normalizedDistance(modulationShape, target.modulation),
    rhythmic_clarity: average([
      normalizedDistance(clamp01(1 - diffusionShape * 0.7), target.rhythmicity),
      normalizedDistance(clamp01(1 - modulationShape * 0.45), target.rhythmicity),
    ]),
    diffusion_profile: average([
      normalizedDistance(diffusionShape, target.diffusion),
      normalizedDistance(clamp01(feedbackShape * 0.55 + modulationShape * 0.2), target.diffusion),
    ]),
    mix_readiness: average([
      clamp01(1 - Math.abs(measurement.metrics.peakDb + 8.5) / 10),
      clamp01(1 - Math.abs(measurement.metrics.rms + 20.5) / 9),
      clamp01(1 - measurement.metrics.clippingRatio * 1.15),
      normalizedDistance(clamp01(1 - diffusionShape * 0.5), target.mix_clarity),
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
