import { compileDspToNative, type CompileProgressStage } from './compiler.js';
import type { BuildTarget } from '../build/targets.js';

type BuildRunnerStage = CompileProgressStage;

interface BuildExecutionPayload {
  id: string;
  pluginId: string;
  versionId: string;
  pluginName: string;
  versionNumber: number;
  faustCode: string;
  target: string;
  uiSpecJson: unknown | null;
  macroJson: unknown | null;
}

interface ProgressPayload {
  stage: BuildRunnerStage;
  statusMessage?: string;
  log?: {
    level: 'info' | 'warn' | 'error';
    message: string;
    source?: string | null;
  };
}

const buildId = process.env.HAYASHI_BUILD_ID;
const serverUrl = process.env.HAYASHI_BUILD_SERVER_URL;
const runnerSecret = process.env.HAYASHI_BUILD_SECRET;

if (!buildId || !serverUrl || !runnerSecret) {
  throw new Error('Missing required build runner environment (HAYASHI_BUILD_ID, HAYASHI_BUILD_SERVER_URL, HAYASHI_BUILD_SECRET)');
}

function internalHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-hayashi-build-secret': runnerSecret!,
  };
}

async function fetchBuildPayload(): Promise<BuildExecutionPayload> {
  const response = await fetch(`${serverUrl}/api/internal/builds/${encodeURIComponent(buildId!)}/payload`, {
    headers: internalHeaders(),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch build payload (${response.status}): ${body || response.statusText}`);
  }
  return response.json();
}

async function postProgress(payload: ProgressPayload): Promise<void> {
  const response = await fetch(`${serverUrl}/api/internal/builds/${encodeURIComponent(buildId!)}/progress`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to post build progress (${response.status}): ${body || response.statusText}`);
  }
}

async function postCompletion(payload: { filename: string; downloadUrl: string; statusMessage: string }): Promise<void> {
  const response = await fetch(`${serverUrl}/api/internal/builds/${encodeURIComponent(buildId!)}/complete`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to mark build complete (${response.status}): ${body || response.statusText}`);
  }
}

async function postFailure(errorMessage: string): Promise<void> {
  const response = await fetch(`${serverUrl}/api/internal/builds/${encodeURIComponent(buildId!)}/fail`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      statusMessage: 'Build failed',
      errorMessage,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to mark build failed (${response.status}): ${body || response.statusText}`);
  }
}

async function main() {
  const build = await fetchBuildPayload();
  const result = await compileDspToNative(
    build.faustCode,
    build.pluginName,
    build.pluginId,
    `v${build.versionNumber}`,
    build.target as BuildTarget,
    build.uiSpecJson ?? undefined,
    build.macroJson ?? undefined,
    {
      onProgress: async (stage, message) => {
        await postProgress({
          stage,
          statusMessage: message,
        });
      },
      onLog: async (level, stage, message, source) => {
        await postProgress({
          stage,
          log: {
            level,
            message,
            source: source ?? 'github-runner',
          },
        });
      },
    },
  );

  await postCompletion({
    filename: result.filename,
    downloadUrl: result.downloadUrl,
    statusMessage: result.fromCache ? 'Using cached build artifact' : 'Build completed successfully',
  });
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await postFailure(message);
  } catch (postError) {
    console.error('[Hayashi] Failed to report GitHub runner error:', postError);
  }
  console.error('[Hayashi] GitHub build runner failed:', message);
  process.exitCode = 1;
});
