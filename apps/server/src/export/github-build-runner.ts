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
const RETRYABLE_FETCH_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

if (!buildId || !serverUrl || !runnerSecret) {
  throw new Error('Missing required build runner environment (HAYASHI_BUILD_ID, HAYASHI_BUILD_SERVER_URL, HAYASHI_BUILD_SECRET)');
}

function internalHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-hayashi-build-secret': runnerSecret!,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = error.cause as { code?: string } | undefined;
  const code = cause?.code;
  if (code && RETRYABLE_FETCH_ERROR_CODES.has(code)) return true;

  const message = error.message.toLowerCase();
  return message.includes('fetch failed')
    || message.includes('econnreset')
    || message.includes('socket')
    || message.includes('timed out');
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  options?: { attempts?: number; label?: string },
): Promise<Response> {
  const attempts = options?.attempts ?? 4;
  const label = options?.label ?? input;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (!isRetryableStatus(response.status) || attempt === attempts) {
        return response;
      }

      const body = await response.text().catch(() => '');
      lastError = new Error(
        `${label} failed with retryable status ${response.status}${body ? `: ${body}` : ''}`,
      );
    } catch (error) {
      lastError = error;
      if (!isRetryableFetchError(error) || attempt === attempts) {
        throw error;
      }
    }

    await sleep(300 * attempt);
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${label}`);
}

async function fetchBuildPayload(): Promise<BuildExecutionPayload> {
  const response = await fetchWithRetry(`${serverUrl}/api/internal/builds/${encodeURIComponent(buildId!)}/payload`, {
    headers: internalHeaders(),
  }, { attempts: 4, label: 'fetch build payload' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch build payload (${response.status}): ${body || response.statusText}`);
  }
  return response.json();
}

async function postProgress(payload: ProgressPayload): Promise<void> {
  const response = await fetchWithRetry(`${serverUrl}/api/internal/builds/${encodeURIComponent(buildId!)}/progress`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(payload),
  }, { attempts: 4, label: 'post build progress' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to post build progress (${response.status}): ${body || response.statusText}`);
  }
}

async function postCompletion(payload: { filename: string; downloadUrl: string; statusMessage: string }): Promise<void> {
  const response = await fetchWithRetry(`${serverUrl}/api/internal/builds/${encodeURIComponent(buildId!)}/complete`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify(payload),
  }, { attempts: 6, label: 'post build completion' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to mark build complete (${response.status}): ${body || response.statusText}`);
  }
}

async function postFailure(errorMessage: string): Promise<void> {
  const response = await fetchWithRetry(`${serverUrl}/api/internal/builds/${encodeURIComponent(buildId!)}/fail`, {
    method: 'POST',
    headers: internalHeaders(),
    body: JSON.stringify({
      statusMessage: 'Build failed',
      errorMessage,
    }),
  }, { attempts: 6, label: 'post build failure' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to mark build failed (${response.status}): ${body || response.statusText}`);
  }
}

async function postProgressBestEffort(payload: ProgressPayload): Promise<void> {
  try {
    await postProgress(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[Hayashi] Failed to post build progress:', message);
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
        await postProgressBestEffort({
          stage,
          statusMessage: message,
        });
      },
      onLog: async (level, stage, message, source) => {
        await postProgressBestEffort({
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
