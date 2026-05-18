import { createHash } from 'crypto';
import { getOptimizationCategory } from './category-registry.js';
import type { OptimizationArchitectureDefinition } from './category-registry.js';
import type { OptimizationCategory, OptimizerJobInput, OptimizerJobResult } from './contracts.js';
import { emitDelayEchoArtifacts, emitParametricEqArtifacts, emitReverbSpaceArtifacts, emitSynthArtifacts } from './emit.js';
import { persistOptimizationTrace } from './history.js';
import { evaluateDelayEchoCandidate } from './metrics/delay-echo.js';
import { evaluateParametricEqCandidate } from './metrics/parametric-eq.js';
import { evaluateReverbSpaceCandidate } from './metrics/reverb-space.js';
import { evaluateSynthCandidate } from './metrics/synth.js';
import { inferDelayEchoTargetsFromPrompt, inferParametricEqTargetsFromPrompt, inferReverbSpaceTargetsFromPrompt, inferSynthTargetsFromPrompt } from './prompt-targets.js';
import { summarizeOptimizationScores, type OptimizationScoreSummary } from './scoring.js';
import { runOptimizerJob } from './worker.js';

function seedFromPrompt(prompt: string): number {
  const digest = createHash('sha256').update(prompt).digest();
  return digest.readUInt32BE(0);
}

function chooseArchitecture(category: OptimizationCategory, family: string): OptimizationArchitectureDefinition {
  const definition = getOptimizationCategory(category);
  return definition.architectures.find((architecture) => architecture.family === family) ?? definition.architectures[0];
}

export function buildParametricEqOptimizerJob(args: {
  prompt: string;
  corpusIds?: string[];
  maxEvaluations?: number;
}): OptimizerJobInput {
  const target = inferParametricEqTargetsFromPrompt(args.prompt);
  const architecture = chooseArchitecture('parametric_eq', target.family);

  return {
    category: 'parametric_eq',
    architectureId: architecture.id,
    parameterRanges: architecture.parameterRanges,
    target,
    metricWeights: architecture.defaultMetricWeights,
    corpusIds: args.corpusIds ?? ['eq-vocal', 'eq-drums', 'eq-bass', 'eq-pad', 'eq-guitar', 'eq-bus'],
    seed: seedFromPrompt(args.prompt),
    maxEvaluations: args.maxEvaluations ?? 64,
  };
}

export async function runParametricEqOptimization(prompt: string): Promise<OptimizerJobResult> {
  const job = buildParametricEqOptimizerJob({ prompt });
  return runOptimizerJob(job);
}

export function buildSynthOptimizerJob(args: {
  prompt: string;
  corpusIds?: string[];
  maxEvaluations?: number;
}): OptimizerJobInput {
  const target = inferSynthTargetsFromPrompt(args.prompt);
  const architecture = chooseArchitecture('synth', target.family);

  return {
    category: 'synth',
    architectureId: architecture.id,
    parameterRanges: architecture.parameterRanges,
    target,
    metricWeights: architecture.defaultMetricWeights,
    corpusIds: args.corpusIds ?? ['synth-bass', 'synth-pad', 'synth-pluck', 'synth-lead', 'synth-impulse', 'synth-sweep'],
    seed: seedFromPrompt(args.prompt),
    maxEvaluations: args.maxEvaluations ?? 64,
  };
}

export async function runSynthOptimization(prompt: string): Promise<OptimizerJobResult> {
  const job = buildSynthOptimizerJob({ prompt });
  return runOptimizerJob(job);
}

export function buildReverbSpaceOptimizerJob(args: {
  prompt: string;
  corpusIds?: string[];
  maxEvaluations?: number;
}): OptimizerJobInput {
  const target = inferReverbSpaceTargetsFromPrompt(args.prompt);
  const architecture = chooseArchitecture('reverb_space', target.family);

  return {
    category: 'reverb_space',
    architectureId: architecture.id,
    parameterRanges: architecture.parameterRanges,
    target,
    metricWeights: architecture.defaultMetricWeights,
    corpusIds: args.corpusIds ?? ['verb-vocal', 'verb-snare', 'verb-pad', 'verb-pluck', 'verb-bus', 'verb-impulse'],
    seed: seedFromPrompt(args.prompt),
    maxEvaluations: args.maxEvaluations ?? 64,
  };
}

export async function runReverbSpaceOptimization(prompt: string): Promise<OptimizerJobResult> {
  const job = buildReverbSpaceOptimizerJob({ prompt });
  return runOptimizerJob(job);
}

export function buildDelayEchoOptimizerJob(args: {
  prompt: string;
  corpusIds?: string[];
  maxEvaluations?: number;
}): OptimizerJobInput {
  const target = inferDelayEchoTargetsFromPrompt(args.prompt);
  const architecture = chooseArchitecture('delay_echo', target.family);

  return {
    category: 'delay_echo',
    architectureId: architecture.id,
    parameterRanges: architecture.parameterRanges,
    target,
    metricWeights: architecture.defaultMetricWeights,
    corpusIds: args.corpusIds ?? ['delay-drums', 'delay-vocal', 'delay-pluck', 'delay-pad', 'delay-bus', 'delay-impulse'],
    seed: seedFromPrompt(args.prompt),
    maxEvaluations: args.maxEvaluations ?? 64,
  };
}

export async function runDelayEchoOptimization(prompt: string): Promise<OptimizerJobResult> {
  const job = buildDelayEchoOptimizerJob({ prompt });
  return runOptimizerJob(job);
}

export interface ParametricEqOptimizationPassOptions {
  corpusIds?: string[];
  maxEvaluations?: number;
}

export interface ParametricEqOptimizationPassResult {
  job: OptimizerJobInput;
  optimizer: OptimizerJobResult;
  score: OptimizationScoreSummary;
  artifacts: ReturnType<typeof emitParametricEqArtifacts>;
}

export interface SynthOptimizationPassResult {
  job: OptimizerJobInput;
  optimizer: OptimizerJobResult;
  score: OptimizationScoreSummary;
  artifacts: ReturnType<typeof emitSynthArtifacts>;
}

export interface ReverbSpaceOptimizationPassResult {
  job: OptimizerJobInput;
  optimizer: OptimizerJobResult;
  score: OptimizationScoreSummary;
  artifacts: ReturnType<typeof emitReverbSpaceArtifacts>;
}

export interface DelayEchoOptimizationPassResult {
  job: OptimizerJobInput;
  optimizer: OptimizerJobResult;
  score: OptimizationScoreSummary;
  artifacts: ReturnType<typeof emitDelayEchoArtifacts>;
}

export async function runParametricEqOptimizationPass(
  prompt: string,
  options: ParametricEqOptimizationPassOptions = {},
): Promise<ParametricEqOptimizationPassResult> {
  const job = buildParametricEqOptimizerJob({
    prompt,
    corpusIds: options.corpusIds,
    maxEvaluations: options.maxEvaluations,
  });
  const optimizer = await runOptimizerJob(job);
  const artifacts = emitParametricEqArtifacts({
    prompt,
    target: job.target,
    candidate: optimizer.winner,
  });
  const metrics = evaluateParametricEqCandidate({
    spec: artifacts.spec,
    faustCode: artifacts.faustCode,
    target: job.target,
    candidate: optimizer.winner,
    metricWeights: job.metricWeights,
  });

  optimizer.winner.metrics = metrics;
  const score = summarizeOptimizationScores(metrics);
  optimizer.tracePath = persistOptimizationTrace({
    schemaVersion: '1.0',
    createdAt: Date.now(),
    job,
    optimizer,
    score,
    artifacts: {
      metadata: artifacts.metadata,
      uiSpec: artifacts.uiSpec,
    },
  });

  return {
    job,
    optimizer,
    score,
    artifacts,
  };
}

export async function runSynthOptimizationPass(
  prompt: string,
  options: ParametricEqOptimizationPassOptions = {},
): Promise<SynthOptimizationPassResult> {
  const job = buildSynthOptimizerJob({
    prompt,
    corpusIds: options.corpusIds,
    maxEvaluations: options.maxEvaluations,
  });
  const optimizer = await runOptimizerJob(job);
  const artifacts = emitSynthArtifacts({
    prompt,
    target: job.target,
    candidate: optimizer.winner,
  });
  const metrics = evaluateSynthCandidate({
    spec: artifacts.spec,
    faustCode: artifacts.faustCode,
    target: job.target,
    candidate: optimizer.winner,
    metricWeights: job.metricWeights,
  });

  optimizer.winner.metrics = metrics;
  const score = summarizeOptimizationScores(metrics);
  optimizer.tracePath = persistOptimizationTrace({
    schemaVersion: '1.0',
    createdAt: Date.now(),
    job,
    optimizer,
    score,
    artifacts: {
      metadata: artifacts.metadata,
      uiSpec: artifacts.uiSpec,
    },
  });

  return {
    job,
    optimizer,
    score,
    artifacts,
  };
}

export async function runReverbSpaceOptimizationPass(
  prompt: string,
  options: ParametricEqOptimizationPassOptions = {},
): Promise<ReverbSpaceOptimizationPassResult> {
  const job = buildReverbSpaceOptimizerJob({
    prompt,
    corpusIds: options.corpusIds,
    maxEvaluations: options.maxEvaluations,
  });
  const optimizer = await runOptimizerJob(job);
  const artifacts = emitReverbSpaceArtifacts({
    prompt,
    target: job.target,
    candidate: optimizer.winner,
  });
  const metrics = evaluateReverbSpaceCandidate({
    spec: artifacts.spec,
    faustCode: artifacts.faustCode,
    target: job.target,
    candidate: optimizer.winner,
    metricWeights: job.metricWeights,
  });

  optimizer.winner.metrics = metrics;
  const score = summarizeOptimizationScores(metrics);
  optimizer.tracePath = persistOptimizationTrace({
    schemaVersion: '1.0',
    createdAt: Date.now(),
    job,
    optimizer,
    score,
    artifacts: {
      metadata: artifacts.metadata,
      uiSpec: artifacts.uiSpec,
    },
  });

  return {
    job,
    optimizer,
    score,
    artifacts,
  };
}

export async function runDelayEchoOptimizationPass(
  prompt: string,
  options: ParametricEqOptimizationPassOptions = {},
): Promise<DelayEchoOptimizationPassResult> {
  const job = buildDelayEchoOptimizerJob({
    prompt,
    corpusIds: options.corpusIds,
    maxEvaluations: options.maxEvaluations,
  });
  const optimizer = await runOptimizerJob(job);
  const artifacts = emitDelayEchoArtifacts({
    prompt,
    target: job.target,
    candidate: optimizer.winner,
  });
  const metrics = evaluateDelayEchoCandidate({
    spec: artifacts.spec,
    faustCode: artifacts.faustCode,
    target: job.target,
    candidate: optimizer.winner,
    metricWeights: job.metricWeights,
  });

  optimizer.winner.metrics = metrics;
  const score = summarizeOptimizationScores(metrics);
  optimizer.tracePath = persistOptimizationTrace({
    schemaVersion: '1.0',
    createdAt: Date.now(),
    job,
    optimizer,
    score,
    artifacts: {
      metadata: artifacts.metadata,
      uiSpec: artifacts.uiSpec,
    },
  });

  return {
    job,
    optimizer,
    score,
    artifacts,
  };
}
