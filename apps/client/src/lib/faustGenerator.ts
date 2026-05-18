import { SERVER_BASE_URL } from './constants';
import { apiFetch, authHeaders } from './http';

export interface PluginParam {
  name: string;
  value: number;
  min: number;
  max: number;
}

import type { UiSpec } from '@/types/uiSpec';

export interface PluginVersion {
  id: string;
  versionNumber: number;
  prompt: string;
  faustCode: string;
  params: PluginParam[];
  qualityLabels: QualityLabel[];
  createdAt: number;
  uiSpec?: UiSpec;
  features?: {
    centroid: number;
    rms: number;
    zcr: number;
    peakDb: number;
  };
}

export type QualityLabel = 'good' | 'harsh' | 'muddy' | 'boring' | 'too_wet' | 'too_narrow' | 'unstable';

export interface PluginMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  versionId?: string;
  createdAt: number;
}

export interface PluginThread {
  id: string;
  name: string;
  type: string;
  generationStatus?: 'ready' | 'generating' | 'refining' | 'failed';
  generationError?: string | null;
  createdAt: number;
  updatedAt: number;
  versions: PluginVersion[];
  messages: PluginMessage[];
}

export interface SharedPluginPayload {
  plugin: PluginThread;
  owner: {
    userId: string;
    name: string;
    imageUrl: string | null;
  };
}

export interface PluginListItem extends PluginThread {}

export interface PluginVersionServer extends Omit<PluginVersion, 'uiSpec'> {
  uiSpecJson?: unknown;
}

export interface CreatePluginResult {
  pluginId: string;
  status: 'generating' | 'ready';
  versionId?: string;
  faustCode?: string;
  params?: PluginParam[];
  type?: string;
  name?: string;
  uiSpec?: UiSpec;
}

export interface PollPluginOptions {
  intervalMs?: number;
  maxAttempts?: number;
  minVersionCount?: number;
  minVersionNumber?: number;
  onHeartbeat?: (attempt: number, thread: PluginThread | null) => void;
}

export async function createPlugin(
  token: string | null,
  prompt: string
): Promise<CreatePluginResult> {
  const res = await apiFetch(`${SERVER_BASE_URL}/api/plugins`, {
    method: 'POST',
    headers: await authHeaders(token),
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Plugin creation failed (${res.status})`);
  }

  return res.json();
}

export interface IteratePluginResult {
  pluginId: string;
  status: 'generating' | 'ready';
  versionId?: string;
  versionNumber?: number;
  faustCode?: string;
  params?: PluginParam[];
  uiSpec?: UiSpec;
}

export async function iteratePlugin(
  token: string | null,
  pluginId: string,
  instruction: string
): Promise<IteratePluginResult> {
  const res = await apiFetch(`${SERVER_BASE_URL}/api/plugins/${pluginId}/iterate`, {
    method: 'POST',
    headers: await authHeaders(token),
    body: JSON.stringify({ instruction }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Iteration failed (${res.status})`);
  }

  return res.json();
}

export async function loadPluginThread(
  token: string | null,
  pluginId: string
): Promise<PluginThread> {
  const url = new URL(`${SERVER_BASE_URL}/api/plugins/${pluginId}`);
  if (token) url.searchParams.set('accessToken', token);
  const res = await apiFetch(url.toString());

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Load failed (${res.status})`);
  }

  return res.json();
}

export async function listPluginThreads(token: string | null): Promise<PluginListItem[]> {
  const url = new URL(`${SERVER_BASE_URL}/api/plugins`);
  if (token) url.searchParams.set('accessToken', token);
  const res = await apiFetch(url.toString());

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `List failed (${res.status})`);
  }

  return res.json();
}

export async function pollPluginUntilReady(
  getToken: () => Promise<string | null>,
  pluginId: string,
  options: PollPluginOptions = {}
): Promise<PluginThread> {
  const intervalMs = options.intervalMs ?? 2000;
  const maxAttempts = options.maxAttempts ?? 300;
  const minVersionCount = options.minVersionCount ?? 1;
  const minVersionNumber = options.minVersionNumber ?? 1;
  const onHeartbeat = options.onHeartbeat;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((res) => setTimeout(res, intervalMs));
    const token = await getToken();
    try {
      const thread = await loadPluginThread(token, pluginId);
      onHeartbeat?.(attempt, thread);
      if (thread.generationStatus === 'failed') {
        throw new Error(thread.generationError || 'Temporal workflow failed');
      }
      const hasEnoughVersions = thread.versions.length >= minVersionCount;
      const hasTargetVersion = thread.versions.some((version) => version.versionNumber >= minVersionNumber);
      if ((thread.generationStatus === 'ready' || thread.generationStatus === undefined) && hasEnoughVersions && hasTargetVersion) {
        return thread;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('401') || message.includes('Unauthorized')) {
        // Token expired during polling — signal the UI layer to re-auth
        window.dispatchEvent(new CustomEvent('hayashi:auth-expired', { detail: { pluginId, attempt } }));
        throw err;
      }
      if (message.includes('Temporal workflow failed')) {
        throw err;
      }
      if (message) {
        const lower = message.toLowerCase();
        if (lower.includes('generation failed') || lower.includes('iteration failed') || lower.includes('activity task failed')) {
          throw err;
        }
      }
      onHeartbeat?.(attempt, null);
      // Other errors (network, 500) — keep polling
      console.warn(`[Hayashi] Poll attempt ${attempt} failed: ${message}`);
    }
  }
  throw new Error('Generation is taking longer than expected. The Temporal workflow may still complete in the background.');
}

export async function setVersionQualityLabels(
  token: string | null,
  pluginId: string,
  versionId: string,
  labels: QualityLabel[],
): Promise<{ pluginId: string; versionId: string; qualityLabels: QualityLabel[] }> {
  const res = await apiFetch(`${SERVER_BASE_URL}/api/plugins/${pluginId}/versions/${versionId}/labels`, {
    method: 'POST',
    headers: await authHeaders(token),
    body: JSON.stringify({ labels }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Label update failed (${res.status})`);
  }

  return res.json();
}

export async function loadSharedPlugin(pluginId: string): Promise<SharedPluginPayload> {
  const res = await apiFetch(`${SERVER_BASE_URL}/api/share/${encodeURIComponent(pluginId)}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Share load failed (${res.status})`);
  }

  return res.json();
}
