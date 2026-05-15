import { IS_LOCAL_DEV, SERVER_BASE_URL } from './constants';
import type { BillingSnapshot } from '@/types/billing';

async function authHeaders(token: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
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

export async function bootstrapBilling(token: string | null) {
  const res = await fetch(`${SERVER_BASE_URL}/billing/bootstrap`, {
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
  const res = await fetch(`${SERVER_BASE_URL}/billing/stream-token`, {
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
  const res = await fetch(`${SERVER_BASE_URL}/billing/export/authorize`, {
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

export interface ExportResult {
  downloadUrl: string;
  fromCache: boolean;
  format: 'vst3' | 'clap';
}

export interface ExportPluginOptions {
  token: string | null;
  pluginName: string;
  pluginId: string;
  version: string;
  faustCode: string;
  format: 'vst3' | 'clap';
}

export async function exportPluginBinary(options: ExportPluginOptions): Promise<ExportResult> {
  const res = await fetch(`${SERVER_BASE_URL}/api/export/${options.format}`, {
    method: 'POST',
    headers: await authHeaders(options.token),
    body: JSON.stringify({
      pluginName: options.pluginName,
      pluginId: options.pluginId,
      version: options.version,
      faustCode: options.faustCode,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Export failed (${res.status})`);
  }

  return res.json();
}
