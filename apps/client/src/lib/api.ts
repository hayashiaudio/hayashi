import { IS_LOCAL_DEV, SERVER_BASE_URL } from './constants';
import type { BillingSnapshot } from '@/types/billing';

export async function saveProjectSnapshot(
  projectId: string,
  snapshot: unknown,
  accessToken: string
) {
  if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) {
    return { skipped: true };
  }
  const res = await fetch(`${SERVER_BASE_URL}/project/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, projectId, snapshot }),
  });
  if (!res.ok) throw new Error('Failed to save project');
  return res.json();
}

export async function loadProjectSnapshot(projectId: string, accessToken: string) {
  if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) {
    return { snapshot: undefined };
  }
  const res = await fetch(`${SERVER_BASE_URL}/project/load/${projectId}?accessToken=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error('Failed to load project');
  return res.json();
}

export async function listProjects(accessToken: string, channelId?: string | null) {
  if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) {
    return { projects: [] };
  }
  const url = new URL(`${SERVER_BASE_URL}/projects/list`);
  url.searchParams.set('accessToken', accessToken);
  if (channelId) url.searchParams.set('channelId', channelId);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to list projects');
  return res.json() as Promise<{
    projects: Array<{ id: string; title: string; channelId?: string | null; createdAt: number; updatedAt: number }>;
  }>;
}

export async function uploadAsset(buffer: ArrayBuffer) {
  if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) {
    throw new Error('Asset upload disabled in local dev while remote server is unavailable');
  }
  const res = await fetch(`${SERVER_BASE_URL}/assets/upload`, {
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
  const res = await fetch(`${SERVER_BASE_URL}/assets/${assetId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete asset');
  return res.json() as Promise<{ deleted: boolean }>;
}

export async function exchangeDiscordAuthCode(code: string) {
  const res = await fetch(`${SERVER_BASE_URL}/discord/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error_description ?? error.error ?? 'Failed to exchange Discord auth code');
  }
  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number | null;
    scope: string;
  }>;
}

export async function bootstrapBilling(input: {
  accessToken: string;
  guildId?: string | null;
  channelId?: string | null;
}) {
  const res = await fetch(`${SERVER_BASE_URL}/billing/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? 'Failed to load billing status');
  }
  return res.json() as Promise<BillingSnapshot>;
}

export async function createBillingStreamToken(input: {
  accessToken: string;
  guildId?: string | null;
  channelId?: string | null;
}) {
  const res = await fetch(`${SERVER_BASE_URL}/billing/stream-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? 'Failed to create billing stream token');
  }
  return res.json() as Promise<{ token: string }>;
}

export async function authorizeExport(input: {
  accessToken: string;
  guildId?: string | null;
  channelId?: string | null;
}) {
  const res = await fetch(`${SERVER_BASE_URL}/billing/export/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body.contextAccess) {
    throw new Error(body.error ?? 'Export authorization failed');
  }
  return body as BillingSnapshot;
}

export interface ExportResult {
  downloadUrl: string;
  fromCache: boolean;
  format: 'vst3' | 'clap';
}

export async function exportPluginBinary(
  accessToken: string,
  pluginName: string,
  pluginId: string,
  version: string,
  faustCode: string,
  format: 'vst3' | 'clap'
): Promise<ExportResult> {
  const res = await fetch(`${SERVER_BASE_URL}/api/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, pluginName, pluginId, version, faustCode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Export failed (${res.status})`);
  }

  return res.json();
}
