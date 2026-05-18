import { Context } from '@temporalio/activity';
import { generateFaustFromPrompt, iterateFaustFromPrompt, type GeneratedFaustResult } from '../faust/generate.js';
import { parseFaustParams, paramsToJson } from '../faust/params.js';
import { persistGeneratedArtifacts } from '../faust/artifacts.js';
import { compileDspToNative } from '../export/compiler.js';
import {
  addVersion,
  addMessage,
  createPlugin,
  updatePluginGenerationState,
  type QualityLabel,
} from '../plugin/repository.js';
import { getBuildExecutionPayload, updateBuild, appendBuildLog, type BuildStage } from '../build/repository.js';
import { randomUUID } from 'crypto';
import { dispatchGitHubBuild, getGitHubWorkflowRunStatus, isGitHubBuildDispatchConfigured } from '../build/github-actions.js';

interface GeneratePluginInput {
  pluginId: string;
  ownerId: string;
  name: string;
  type: string;
  prompt: string;
}

interface IteratePluginInput {
  pluginId: string;
  ownerId: string;
  instruction: string;
  previousCode: string;
  previousPrompts: string[];
  type: 'synth' | 'effect' | 'percussion';
  previousParams: { name: string; min: number; max: number }[];
  nextVersionNumber: number;
}

interface ExportBuildInput {
  buildId: string;
}

export async function generatePluginActivity(input: GeneratePluginInput): Promise<GeneratedFaustResult> {
  console.log(`[Temporal] Starting generation for plugin ${input.pluginId}`);
  const result = await generateFaustFromPrompt(input.prompt);
  console.log(`[Temporal] Generation complete for plugin ${input.pluginId}`);
  return result;
}

export async function iteratePluginActivity(input: IteratePluginInput): Promise<GeneratedFaustResult> {
  console.log(`[Temporal] Starting iteration for plugin ${input.pluginId}`);
  const result = await iterateFaustFromPrompt(
    input.instruction,
    input.previousCode,
    input.previousPrompts,
    input.type,
    input.previousParams
  );
  console.log(`[Temporal] Iteration complete for plugin ${input.pluginId}`);
  return result;
}

export async function persistPluginActivity(
  input: GeneratePluginInput,
  generated: GeneratedFaustResult
): Promise<{ versionId: string; params: ReturnType<typeof parseFaustParams> }> {
  const params = parseFaustParams(generated.faustCode);
  const versionId = `${input.pluginId}-v1`;

  await createPlugin({
    id: input.pluginId,
    ownerId: input.ownerId,
    name: input.name,
    type: input.type,
    generationStatus: 'generating',
  });

  const artifactManifest = await persistGeneratedArtifacts(input.pluginId, versionId, generated);

  await addVersion({
    id: versionId,
    pluginId: input.pluginId,
    versionNumber: 1,
    prompt: input.prompt,
    faustCode: generated.faustCode,
    paramsJson: paramsToJson(params),
    specJson: generated.spec,
    templateId: generated.templateId,
    toneModel: generated.toneModel,
    qualityProfile: generated.qualityProfile,
    stereoProfile: generated.stereoProfile,
    macroJson: generated.macroJson,
    uiSpecJson: generated.uiSpecJson,
    evalMetricsJson: generated.evalMetricsJson,
    qualityLabelsJson: [],
    compileErrorsJson: generated.compileErrorsJson,
    artifactManifestJson: artifactManifest,
  });

  await addMessage({ id: `msg-${Date.now()}-user`, pluginId: input.pluginId, role: 'user', content: input.prompt });
  await addMessage({ id: `msg-${Date.now()}-assistant`, pluginId: input.pluginId, role: 'assistant', content: generated.faustCode, versionId });

  return { versionId, params };
}

export async function persistIterationActivity(
  input: IteratePluginInput,
  generated: GeneratedFaustResult
): Promise<{ versionId: string; params: ReturnType<typeof parseFaustParams> }> {
  const params = parseFaustParams(generated.faustCode);
  const versionId = `${input.pluginId}-v${input.nextVersionNumber}`;

  const artifactManifest = await persistGeneratedArtifacts(input.pluginId, versionId, generated);

  await addVersion({
    id: versionId,
    pluginId: input.pluginId,
    versionNumber: input.nextVersionNumber,
    prompt: input.instruction,
    faustCode: generated.faustCode,
    paramsJson: paramsToJson(params),
    specJson: generated.spec,
    templateId: generated.templateId,
    toneModel: generated.toneModel,
    qualityProfile: generated.qualityProfile,
    stereoProfile: generated.stereoProfile,
    macroJson: generated.macroJson,
    uiSpecJson: generated.uiSpecJson,
    evalMetricsJson: generated.evalMetricsJson,
    qualityLabelsJson: [],
    compileErrorsJson: generated.compileErrorsJson,
    artifactManifestJson: artifactManifest,
  });

  await addMessage({ id: `msg-${Date.now()}-user`, pluginId: input.pluginId, role: 'user', content: input.instruction });
  await addMessage({ id: `msg-${Date.now()}-assistant`, pluginId: input.pluginId, role: 'assistant', content: generated.faustCode, versionId });

  return { versionId, params };
}

export async function markBuildFailedActivity(input: { buildId: string; errorMessage: string }): Promise<void> {
  await updateBuild({
    id: input.buildId,
    status: 'failed',
    stage: 'failed',
    statusMessage: 'Build failed',
    errorMessage: input.errorMessage,
    completedAt: Date.now(),
  });
}

export async function markPluginFailedActivity(input: { pluginId: string; errorMessage: string }): Promise<void> {
  await updatePluginGenerationState({
    pluginId: input.pluginId,
    generationStatus: 'failed',
    generationError: input.errorMessage,
  });
}

export async function exportBuildActivity(input: ExportBuildInput): Promise<void> {
  const build = await getBuildExecutionPayload(input.buildId);
  if (!build) {
    throw new Error(`Build ${input.buildId} not found`);
  }

  // Capture the Temporal heartbeat function here, while AsyncLocalStorage context is active.
  // Calling Context.current() inside setInterval loses the context, so we must bind it now.
  let temporalHeartbeat: ((details?: unknown) => void) | null = null;
  try {
    temporalHeartbeat = Context.current().heartbeat.bind(Context.current());
  } catch {
    // Inline fallback — not running inside a Temporal worker
  }

  const setProgress = async (stage: BuildStage, statusMessage: string) => {
    await updateBuild({
      id: input.buildId,
      status: stage === 'completed' ? 'completed' : 'running',
      stage,
      statusMessage,
      startedAt: build.startedAt ?? Date.now(),
      errorMessage: null,
    });
  };

  const appendLog = async (level: 'info' | 'warn' | 'error', stage: BuildStage, message: string, source?: string | null) => {
    await appendBuildLog({
      id: `log-${Date.now()}-${randomUUID().slice(0, 8)}`,
      buildId: input.buildId,
      level,
      stage,
      source: source ?? null,
      message,
      createdAt: Date.now(),
    });
  };

  let lastLogAt = Date.now();
  temporalHeartbeat?.({ lastLogAt });
  const HEARTBEAT_INTERVAL_MS = 10_000;
  const HEARTBEAT_LOG_INTERVAL_MS = 20_000;
  const heartbeatInterval = setInterval(() => {
    const elapsed = Date.now() - lastLogAt;
    if (elapsed > HEARTBEAT_LOG_INTERVAL_MS) {
      const heartbeatStage = build.status === 'queued' ? 'dispatching' : 'building_dpf';
      void appendLog('info', heartbeatStage, `Build still running (${Math.round(elapsed / 1000)}s since last output)`, 'heartbeat');
    }
    temporalHeartbeat?.({ elapsedSinceLastLog: elapsed });
  }, HEARTBEAT_INTERVAL_MS);

  const sendHeartbeat = () => {
    lastLogAt = Date.now();
    temporalHeartbeat?.({ lastLogAt });
  };

  const runLocalBuild = async () => {
    await setProgress('preparing', 'Preparing native export toolchain');
    const result = await compileDspToNative(
      build.faustCode,
      build.pluginName,
      build.pluginId,
      `v${build.versionNumber}`,
      build.target,
      build.uiSpecJson ?? undefined,
      build.macroJson ?? undefined,
      {
        onProgress: async (stage, message) => {
          sendHeartbeat();
          await setProgress(stage, message);
        },
        onLog: async (level, stage, message, source) => {
          sendHeartbeat();
          await appendLog(level, stage, message, source);
        },
      },
    );

    await updateBuild({
      id: input.buildId,
      status: 'completed',
      stage: 'completed',
      statusMessage: result.fromCache ? 'Using cached build artifact' : 'Build completed successfully',
      filename: result.filename,
      downloadUrl: result.downloadUrl,
      completedAt: Date.now(),
      startedAt: build.startedAt ?? Date.now(),
      errorMessage: null,
    });
  };

  const waitForExternalBuildCompletion = async () => {
    await setProgress('dispatching', `Dispatching ${build.target} build to GitHub Actions`);
    await appendLog('info', 'dispatching', `Dispatching ${build.target} build to GitHub Actions`, 'dispatch');
    const dispatch = await dispatchGitHubBuild({ buildId: input.buildId, target: build.target });
    await appendLog('info', 'dispatching', `GitHub Actions workflow dispatched successfully: ${dispatch.htmlUrl}`, 'dispatch');

    const pollIntervalMs = 5000;
    const timeoutMs = 4 * 60 * 60 * 1000;
    const startedWaitingAt = Date.now();
    let lastRemoteStatus = '';

    while (Date.now() - startedWaitingAt < timeoutMs) {
      sendHeartbeat();
      const remoteRun = await getGitHubWorkflowRunStatus(dispatch.workflowRunId);
      const remoteSummary = remoteRun.conclusion
        ? `${remoteRun.status}:${remoteRun.conclusion}`
        : remoteRun.status;
      if (remoteSummary !== lastRemoteStatus) {
        lastRemoteStatus = remoteSummary;
        await appendLog('info', 'dispatching', `GitHub Actions run status: ${remoteSummary}`, 'dispatch');
      }

      if (remoteRun.status === 'completed' && remoteRun.conclusion && remoteRun.conclusion !== 'success') {
        throw new Error(`GitHub Actions run failed with conclusion "${remoteRun.conclusion}": ${remoteRun.htmlUrl}`);
      }

      const current = await getBuildExecutionPayload(input.buildId);
      if (!current) {
        throw new Error(`Build ${input.buildId} disappeared while waiting for remote builder`);
      }

      if (current.status === 'completed') {
        return;
      }

      if (current.status === 'failed') {
        throw new Error(current.errorMessage || 'Remote build failed');
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Timed out waiting for GitHub Actions to finish build ${input.buildId}`);
  };

  try {
    if (isGitHubBuildDispatchConfigured()) {
      await waitForExternalBuildCompletion();
    } else {
      await appendLog('warn', 'preparing', 'GitHub Actions builder is not configured; falling back to local export build', 'dispatch');
      await runLocalBuild();
    }
    clearInterval(heartbeatInterval);
  } catch (error) {
    clearInterval(heartbeatInterval);
    const message = error instanceof Error ? error.message : 'Export build failed';
    await updateBuild({
      id: input.buildId,
      status: 'failed',
      stage: 'failed',
      statusMessage: 'Build failed',
      errorMessage: message,
      completedAt: Date.now(),
      startedAt: build.startedAt ?? Date.now(),
    });
    throw error;
  }
}
