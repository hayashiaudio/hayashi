import type { OptimizationArchitectureId } from '../contracts.js';
import { runParametricEqOptimizationPass, type ParametricEqOptimizationPassOptions } from '../orchestrator.js';

export interface ParametricEqBenchmarkCase {
  id: string;
  prompt: string;
  corpusIds: string[];
  expectedArchitectureId?: OptimizationArchitectureId;
}

export interface ParametricEqBenchmarkResult {
  benchmark: ParametricEqBenchmarkCase;
  architectureId: OptimizationArchitectureId;
  score: number;
  tracePath?: string;
}

const PARAMETRIC_EQ_BENCHMARKS: ParametricEqBenchmarkCase[] = [
  {
    id: 'vocal-air',
    prompt: 'warm airy vocal EQ with forward presence',
    corpusIds: ['eq-vocal', 'eq-sweep', 'eq-impulse'],
    expectedArchitectureId: 'eq_3band_musical',
  },
  {
    id: 'mastering-tilt',
    prompt: 'analog mastering eq with smooth air and bus glue',
    corpusIds: ['eq-bus', 'eq-pad', 'eq-sweep'],
    expectedArchitectureId: 'eq_tilt_presence',
  },
  {
    id: 'surgical-cleanup',
    prompt: 'clean surgical corrective EQ for harsh mids',
    corpusIds: ['eq-guitar', 'eq-vocal', 'eq-sweep'],
    expectedArchitectureId: 'eq_5band_parametric',
  },
  {
    id: 'creative-resonance',
    prompt: 'resonant creative color EQ with textured presence',
    corpusIds: ['eq-guitar', 'eq-pad', 'eq-impulse'],
    expectedArchitectureId: 'eq_resonant_creative',
  },
];

export function getParametricEqBenchmarkCases(): ParametricEqBenchmarkCase[] {
  return PARAMETRIC_EQ_BENCHMARKS;
}

export async function runParametricEqBenchmarkCase(
  benchmark: ParametricEqBenchmarkCase,
  options: ParametricEqOptimizationPassOptions = {},
): Promise<ParametricEqBenchmarkResult> {
  const result = await runParametricEqOptimizationPass(benchmark.prompt, {
    corpusIds: benchmark.corpusIds,
    maxEvaluations: options.maxEvaluations,
  });

  return {
    benchmark,
    architectureId: result.optimizer.winner.architectureId,
    score: result.score.totalScore,
    tracePath: result.optimizer.tracePath,
  };
}

export async function runParametricEqBenchmarkSuite(
  options: ParametricEqOptimizationPassOptions = {},
): Promise<ParametricEqBenchmarkResult[]> {
  const results: ParametricEqBenchmarkResult[] = [];
  for (const benchmark of PARAMETRIC_EQ_BENCHMARKS) {
    results.push(await runParametricEqBenchmarkCase(benchmark, options));
  }
  return results;
}
