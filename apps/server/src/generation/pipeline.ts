import { generateFaustFromPrompt, inferPluginType, type GeneratedFaustResult } from '../faust/generate.js';
import { runParametricEqOptimizationPass } from '../optimization/orchestrator.js';

export type AppGenerationPipeline = 'legacy' | 'parametric_eq_optimizer';

export interface AppGenerationPlan {
  pipeline: AppGenerationPipeline;
  pluginType: 'synth' | 'effect' | 'percussion';
}

const EQ_PROMPT_RE = /\b(eq|equalizer)\b/i;
const PARAMETRIC_EQ_RE = /\bparametric\b/i;
const EQ_CONTEXT_RE = /\b(mid-?side|midside|band|bands|bell|shelf|notch|q|presence|air)\b/i;

export function isParametricEqPrompt(prompt: string): boolean {
  const normalized = prompt.trim();
  if (!normalized) return false;
  if (EQ_PROMPT_RE.test(normalized)) return true;
  return PARAMETRIC_EQ_RE.test(normalized) && EQ_CONTEXT_RE.test(normalized);
}

export function buildAppGenerationPlan(prompt: string): AppGenerationPlan {
  if (isParametricEqPrompt(prompt)) {
    return {
      pipeline: 'parametric_eq_optimizer',
      pluginType: 'effect',
    };
  }

  return {
    pipeline: 'legacy',
    pluginType: inferPluginType(prompt),
  };
}

function toGeneratedFaustResultFromEq(prompt: string, result: Awaited<ReturnType<typeof runParametricEqOptimizationPass>>): GeneratedFaustResult {
  return {
    faustCode: result.artifacts.faustCode,
    spec: result.artifacts.spec,
    templateId: result.artifacts.spec.voiceArchitecture ?? null,
    toneModel: result.artifacts.spec.toneModel ?? null,
    qualityProfile: result.artifacts.spec.qualityProfile ?? null,
    stereoProfile: result.artifacts.spec.stereoProfile ?? null,
    macroJson: result.artifacts.spec.macroControls ?? [],
    uiSpecJson: result.artifacts.uiSpec,
    evalMetricsJson: {
      category: 'parametric_eq',
      prompt,
      tracePath: result.optimizer.tracePath ?? null,
      target: result.job.target,
      metricWeights: result.job.metricWeights,
      winner: result.optimizer.winner,
      score: result.score,
      rejectedRegions: result.optimizer.rejectedRegions,
      candidateLineage: {
        candidateCount: 1,
        selectedCandidateId: 'optimizer-winner',
      },
    },
    compileErrorsJson: [],
    artifactManifestJson: {
      schemaVersion: '1.0',
      artifacts: [],
    },
  };
}

export async function generatePluginFromPrompt(prompt: string): Promise<GeneratedFaustResult> {
  const plan = buildAppGenerationPlan(prompt);
  if (plan.pipeline === 'parametric_eq_optimizer') {
    const optimized = await runParametricEqOptimizationPass(prompt);
    return toGeneratedFaustResultFromEq(prompt, optimized);
  }

  return generateFaustFromPrompt(prompt);
}
