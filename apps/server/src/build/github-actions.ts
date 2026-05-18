import { timingSafeEqual } from 'crypto';
import type { BuildTarget } from './targets.js';

interface DispatchGitHubBuildOptions {
  buildId: string;
  target: BuildTarget;
}

export interface GitHubWorkflowDispatchResult {
  workflowRunId: number;
  runUrl: string;
  htmlUrl: string;
}

export interface GitHubWorkflowRunStatus {
  id: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
}

interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  path: string;
  event: string;
  head_branch: string | null;
  created_at: string;
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

function getGitHubDispatchConfig() {
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

  return { token, workflow, environment, ref, serverUrl, owner, repository };
}

function githubApiHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'hayashi-build-dispatch',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubApiFetch(path: string, init: RequestInit & { token: string }) {
  const { token, headers, ...rest } = init;
  return fetch(`https://api.github.com${path}`, {
    ...rest,
    headers: {
      ...githubApiHeaders(token),
      ...(headers ?? {}),
    },
  });
}

function normalizeWorkflowPath(value: string): string {
  return value.startsWith('.github/workflows/') ? value : `.github/workflows/${value}`;
}

function workflowMatches(workflow: GitHubWorkflow, configured: string): boolean {
  if (String(workflow.id) === configured) return true;
  if (workflow.name === configured) return true;
  if (workflow.path === configured) return true;
  if (workflow.path === normalizeWorkflowPath(configured)) return true;
  return false;
}

export function selectGitHubWorkflow(
  workflows: GitHubWorkflow[],
  configuredWorkflow: string,
): GitHubWorkflow {
  const match = workflows.find((workflow) => workflowMatches(workflow, configuredWorkflow));
  if (!match) {
    const available = workflows.map((workflow) => `${workflow.name} (${workflow.path})`).join(', ');
    throw new Error(
      `Unable to find GitHub Actions workflow "${configuredWorkflow}". Available workflows: ${available || 'none'}`,
    );
  }
  return match;
}

async function resolveGitHubWorkflow(token: string, owner: string, repository: string, configuredWorkflow: string): Promise<GitHubWorkflow> {
  const response = await githubApiFetch(
    `/repos/${owner}/${repository}/actions/workflows`,
    {
      method: 'GET',
      token,
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub Actions workflow lookup failed (${response.status}): ${body || response.statusText}`);
  }

  const payload = await response.json() as { workflows?: GitHubWorkflow[] };
  return selectGitHubWorkflow(payload.workflows ?? [], configuredWorkflow);
}

function extractWorkflowNameFromPath(path: string): string {
  const suffix = path.split('.github/workflows/')[1] ?? path;
  return suffix.replace(/\.ya?ml$/i, '');
}

export function selectDispatchedWorkflowRun(
  workflow: GitHubWorkflow,
  runs: GitHubWorkflowRun[],
  ref: string,
  dispatchedAt: number,
): GitHubWorkflowRun | null {
  const minCreatedAt = dispatchedAt - 60_000;
  const workflowPath = normalizeWorkflowPath(workflow.path);
  const workflowNameFromPath = extractWorkflowNameFromPath(workflow.path);

  return runs.find((run) => {
    const createdAt = Date.parse(run.created_at);
    if (Number.isNaN(createdAt) || createdAt < minCreatedAt) return false;
    if (run.event !== 'workflow_dispatch') return false;
    if (run.head_branch && run.head_branch !== ref) return false;
    if (run.path === workflowPath) return true;
    if (run.name === workflow.name) return true;
    return run.path.endsWith(`${workflowNameFromPath}.yml`) || run.path.endsWith(`${workflowNameFromPath}.yaml`);
  }) ?? null;
}

async function findDispatchedWorkflowRun(
  token: string,
  owner: string,
  repository: string,
  workflow: GitHubWorkflow,
  ref: string,
  dispatchedAt: number,
): Promise<GitHubWorkflowRun> {
  const timeoutMs = 30_000;
  const pollIntervalMs = 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await githubApiFetch(
      `/repos/${owner}/${repository}/actions/workflows/${workflow.id}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=10`,
      {
        method: 'GET',
        token,
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`GitHub Actions run lookup failed (${response.status}): ${body || response.statusText}`);
    }

    const payload = await response.json() as { workflow_runs?: GitHubWorkflowRun[] };
    const run = selectDispatchedWorkflowRun(workflow, payload.workflow_runs ?? [], ref, dispatchedAt);
    if (run) {
      return run;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`GitHub Actions dispatch succeeded but no workflow run appeared for "${workflow.name}" on ref "${ref}"`);
}

export async function dispatchGitHubBuild(options: DispatchGitHubBuildOptions): Promise<GitHubWorkflowDispatchResult> {
  const { token, workflow, environment, ref, serverUrl, owner, repository } = getGitHubDispatchConfig();
  const resolvedWorkflow = await resolveGitHubWorkflow(token, owner, repository, workflow);
  const dispatchedAt = Date.now();

  const response = await githubApiFetch(
    `/repos/${owner}/${repository}/actions/workflows/${resolvedWorkflow.id}/dispatches`,
    {
      method: 'POST',
      token,
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
  const run = await findDispatchedWorkflowRun(token, owner, repository, resolvedWorkflow, ref, dispatchedAt);

  return {
    workflowRunId: run.id,
    runUrl: `https://api.github.com/repos/${owner}/${repository}/actions/runs/${run.id}`,
    htmlUrl: run.html_url,
  };
}

export async function getGitHubWorkflowRunStatus(runId: number): Promise<GitHubWorkflowRunStatus> {
  const { token, owner, repository } = getGitHubDispatchConfig();
  const response = await githubApiFetch(
    `/repos/${owner}/${repository}/actions/runs/${runId}`,
    {
      method: 'GET',
      token,
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub Actions run status lookup failed (${response.status}): ${body || response.statusText}`);
  }

  const payload = await response.json() as {
    id: number;
    status: string;
    conclusion: string | null;
    html_url: string;
  };

  return {
    id: payload.id,
    status: payload.status,
    conclusion: payload.conclusion,
    htmlUrl: payload.html_url,
  };
}
