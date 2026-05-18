import { timingSafeEqual } from 'crypto';
import type { BuildTarget } from './targets.js';

interface DispatchGitHubBuildOptions {
  buildId: string;
  target: BuildTarget;
}

function compareSecrets(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isGitHubBuildDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_ACTIONS_BUILDS_TOKEN
    && process.env.GITHUB_ACTIONS_BUILDS_REPO
    && process.env.GITHUB_ACTIONS_BUILDS_WORKFLOW
    && process.env.GITHUB_ACTIONS_BUILDS_ENVIRONMENT
    && process.env.GITHUB_ACTIONS_BUILDS_SERVER_URL
    && process.env.HAYASHI_BUILD_RUNNER_SECRET
  );
}

export function getBuildRunnerSecret(): string {
  const secret = process.env.HAYASHI_BUILD_RUNNER_SECRET;
  if (!secret) {
    throw new Error('HAYASHI_BUILD_RUNNER_SECRET is not configured');
  }
  return secret;
}

export function verifyBuildRunnerSecret(received: string | null | undefined): boolean {
  if (!received) return false;
  try {
    return compareSecrets(getBuildRunnerSecret(), received);
  } catch {
    return false;
  }
}

export async function dispatchGitHubBuild(options: DispatchGitHubBuildOptions): Promise<void> {
  const token = process.env.GITHUB_ACTIONS_BUILDS_TOKEN;
  const repo = process.env.GITHUB_ACTIONS_BUILDS_REPO;
  const workflow = process.env.GITHUB_ACTIONS_BUILDS_WORKFLOW;
  const environment = process.env.GITHUB_ACTIONS_BUILDS_ENVIRONMENT;
  const ref = process.env.GITHUB_ACTIONS_BUILDS_REF ?? 'main';
  const serverUrl = process.env.GITHUB_ACTIONS_BUILDS_SERVER_URL;

  if (!token || !repo || !workflow || !environment || !serverUrl || !process.env.HAYASHI_BUILD_RUNNER_SECRET) {
    throw new Error('GitHub Actions build dispatch is not fully configured');
  }

  const [owner, repository] = repo.split('/');
  if (!owner || !repository) {
    throw new Error(`Invalid GITHUB_ACTIONS_BUILDS_REPO value: ${repo}`);
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'hayashi-build-dispatch',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        ref,
        inputs: {
          build_id: options.buildId,
          target: options.target,
          environment,
          server_url: serverUrl,
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub Actions dispatch failed (${response.status}): ${body || response.statusText}`);
  }
}
