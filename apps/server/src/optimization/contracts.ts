import type { UiSpec } from '../ui/types.js';
import type { StableOptimizationArtifactContract } from './normalize.js';

export type OptimizationCategory = 'parametric_eq' | 'synth' | 'reverb_space' | 'delay_echo';

export type ParametricEqArchitectureId =
  | 'eq_3band_musical'
  | 'eq_5band_parametric'
  | 'eq_tilt_presence'
  | 'eq_resonant_creative';

export type SynthArchitectureId =
  | 'mono_bass'
  | 'supersaw_pad'
  | 'velvet_pluck'
  | 'stereo_lead';

export type ReverbSpaceArchitectureId =
  | 'plate_space'
  | 'hall_bloom'
  | 'modulated_echo_verb'
  | 'dark_motion_verb';

export type DelayEchoArchitectureId =
  | 'tempo_echo'
  | 'modulated_echo_delay';

export type OptimizationArchitectureId =
  | ParametricEqArchitectureId
  | SynthArchitectureId
  | ReverbSpaceArchitectureId
  | DelayEchoArchitectureId;

export interface OptimizationParameterRange {
  id: string;
  min: number;
  max: number;
  initial: number;
}

export interface OptimizationTargetVector {
  category: OptimizationCategory;
  family: string;
  values: Record<string, number>;
  constraints?: unknown;
}

export interface OptimizationMetricWeights {
  [metricId: string]: number;
}

export interface OptimizationMetricScore {
  metricId: string;
  value: number;
  weight: number;
  weightedScore: number;
}

export interface OptimizationCandidateResult {
  architectureId: OptimizationArchitectureId;
  params: Record<string, number>;
  score: number;
  metrics: OptimizationMetricScore[];
}

export interface OptimizerJobInput {
  category: OptimizationCategory;
  architectureId: OptimizationArchitectureId;
  parameterRanges: OptimizationParameterRange[];
  target: OptimizationTargetVector;
  metricWeights: OptimizationMetricWeights;
  corpusIds: string[];
  seed: number;
  maxEvaluations: number;
}

export interface OptimizerJobResult {
  winner: OptimizationCandidateResult;
  rejectedRegions: string[];
  tracePath?: string;
}

export interface NormalizedGeneratedArtifacts extends StableOptimizationArtifactContract {
  uiSpec: UiSpec;
}
