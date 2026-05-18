import type { OptimizationMetricScore } from './contracts.js';

export interface OptimizationScoreSummary {
  totalScore: number;
  metrics: OptimizationMetricScore[];
}

export function summarizeOptimizationScores(metrics: OptimizationMetricScore[]): OptimizationScoreSummary {
  const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0);
  const totalWeighted = metrics.reduce((sum, metric) => sum + metric.weightedScore, 0);

  return {
    totalScore: totalWeight > 0 ? totalWeighted / totalWeight : 0,
    metrics,
  };
}
