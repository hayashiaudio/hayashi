import { IS_LOCAL_DEV, SERVER_BASE_URL } from './constants';
import type { BillingSnapshot } from '@/types/billing';
import { apiFetch, authHeaders } from './http';

export async function uploadAsset(buffer: ArrayBuffer) {
  if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) {
    throw new Error('Asset upload disabled in local dev while remote server is unavailable');
  }
  const res = await apiFetch(`${SERVER_BASE_URL}/assets/upload`, {
    method: 'POST',
    body: buffer,
  });
  if (!res.ok) throw new Error('Failed to upload asset');
  return res.json() as Promise<{ assetId: string; url: string }>;
}

export async function deleteAsset(assetId: string) {
  if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) {
    return { deleted: true };
  }
  const res = await apiFetch(`${SERVER_BASE_URL}/assets/${assetId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete asset');
  return res.json() as Promise<{ deleted: boolean }>;
}

export async function bootstrapBilling(token: string | null) {
  const res = await apiFetch(`${SERVER_BASE_URL}/billing/bootstrap`, {
    method: 'POST',
    headers: await authHeaders(token),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? 'Failed to load billing status');
  }
  return res.json() as Promise<BillingSnapshot>;
}

export async function createBillingStreamToken(token: string | null) {
  const res = await apiFetch(`${SERVER_BASE_URL}/billing/stream-token`, {
    method: 'POST',
    headers: await authHeaders(token),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? 'Failed to create billing stream token');
  }
  return res.json() as Promise<{ token: string }>;
}

export async function authorizeExport(token: string | null) {
  const res = await apiFetch(`${SERVER_BASE_URL}/billing/export/authorize`, {
    method: 'POST',
    headers: await authHeaders(token),
    body: JSON.stringify({}),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body.contextAccess) {
    throw new Error(body.error ?? 'Export authorization failed');
  }
  return body as BillingSnapshot;
}

export type BuildStatus = 'queued' | 'running' | 'completed' | 'failed';
export type BuildStage = 'queued' | 'preparing' | 'dispatching' | 'building_dpf' | 'building_ui' | 'packaging' | 'uploading' | 'completed' | 'failed';
export type BuildTarget =
  | 'vst3-linux-x64'
  | 'vst3-windows-x64'
  | 'vst3-macos-x64'
  | 'vst3-macos-arm64'
  | 'clap-linux-x64'
  | 'clap-windows-x64'
  | 'clap-macos-x64'
  | 'clap-macos-arm64';

export const BUILD_TARGET_OPTIONS: Array<{ value: BuildTarget; label: string }> = [
  { value: 'vst3-windows-x64', label: 'Windows VST3' },
  { value: 'vst3-macos-arm64', label: 'macOS VST3 (Apple Silicon)' },
  { value: 'vst3-macos-x64', label: 'macOS VST3 (Intel)' },
  { value: 'vst3-linux-x64', label: 'Linux VST3' },
  { value: 'clap-windows-x64', label: 'Windows CLAP' },
  { value: 'clap-macos-arm64', label: 'macOS CLAP (Apple Silicon)' },
  { value: 'clap-macos-x64', label: 'macOS CLAP (Intel)' },
  { value: 'clap-linux-x64', label: 'Linux CLAP' },
];

export function labelForBuildTarget(target: BuildTarget): string {
  return BUILD_TARGET_OPTIONS.find((option) => option.value === target)?.label ?? target;
}

export interface BuildRecord {
  id: string;
  pluginId: string;
  versionId: string;
  ownerId: string;
  format: 'vst3' | 'clap';
  target: BuildTarget;
  workflowId: string | null;
  status: BuildStatus;
  stage: BuildStage;
  statusMessage: string | null;
  filename: string | null;
  downloadUrl: string | null;
  errorMessage: string | null;
  startedAt: number | null;
  completedAt: number | null;
  metadataJson: unknown | null;
  createdAt: number;
  updatedAt: number;
  pluginName?: string | null;
  versionNumber?: number | null;
}

export interface ExportPluginOptions {
  token: string | null;
  pluginName: string;
  pluginId: string;
  version: string;
  versionId?: string;
  faustCode: string;
  format: 'vst3' | 'clap';
  target: BuildTarget;
}

export async function startExportBuild(options: ExportPluginOptions): Promise<BuildRecord> {
  const res = await apiFetch(`${SERVER_BASE_URL}/api/export/${options.format}`, {
    method: 'POST',
    headers: await authHeaders(options.token),
    body: JSON.stringify({
      pluginName: options.pluginName,
      pluginId: options.pluginId,
      version: options.version,
      versionId: options.versionId,
      faustCode: options.faustCode,
      target: options.target,
    }),
  });

  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Export failed (${res.status})`);
  }

  return res.json();
}

export interface BuildLogRecord {
  id: string;
  buildId: string;
  level: 'info' | 'warn' | 'error';
  stage: BuildStage;
  source: string | null;
  message: string;
  createdAt: number;
}

export interface SmokeExportResult {
  pluginId: string;
  versionId: string;
  build: BuildRecord;
  optimizer: {
    architectureId: string;
    score: number;
  };
}

export async function runSmokeExport(options: {
  token: string;
  category: 'parametric_eq' | 'synth' | 'reverb_space' | 'delay_echo';
  prompt: string;
  format: 'vst3' | 'clap';
  pluginName?: string;
}): Promise<SmokeExportResult> {
  const route = options.category === 'synth'
    ? '/api/smoke/synth/export'
    : options.category === 'delay_echo'
      ? '/api/smoke/delay-echo/export'
    : options.category === 'reverb_space'
      ? '/api/smoke/reverb-space/export'
      : '/api/smoke/parametric-eq/export';
  const res = await apiFetch(`${SERVER_BASE_URL}${route}`, {
    method: 'POST',
    headers: await authHeaders(options.token),
    body: JSON.stringify({
      accessToken: options.token,
      prompt: options.prompt,
      format: options.format,
      pluginName: options.pluginName,
    }),
  });

  if (!res.ok && res.status !== 202) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Smoke export failed (${res.status})`);
  }

  return res.json();
}

export async function listBuilds(token: string | null): Promise<BuildRecord[]> {
  const url = new URL(`${SERVER_BASE_URL}/api/builds`);
  if (token) url.searchParams.set('accessToken', token);
  const res = await apiFetch(url.toString());

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Build list failed (${res.status})`);
  }

  return res.json();
}

export async function getBuildLogs(buildId: string, token: string | null): Promise<BuildLogRecord[]> {
  const url = new URL(`${SERVER_BASE_URL}/api/builds/${encodeURIComponent(buildId)}/logs`);
  if (token) url.searchParams.set('accessToken', token);
  const res = await apiFetch(url.toString());

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Build logs failed (${res.status})`);
  }

  return res.json();
}
