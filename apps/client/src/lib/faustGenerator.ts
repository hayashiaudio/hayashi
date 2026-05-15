import { SERVER_BASE_URL } from './constants';

export interface PluginParam {
  name: string;
  value: number;
  min: number;
  max: number;
}

export interface PluginVersion {
  id: string;
  versionNumber: number;
  prompt: string;
  faustCode: string;
  params: PluginParam[];
  createdAt: number;
}

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
  createdAt: number;
  updatedAt: number;
  versions: PluginVersion[];
  messages: PluginMessage[];
}

export interface CreatePluginResult {
  pluginId: string;
  versionId: string;
  faustCode: string;
  params: PluginParam[];
  type: string;
  name: string;
}

export async function createPlugin(
  accessToken: string,
  prompt: string
): Promise<CreatePluginResult> {
  const res = await fetch(`${SERVER_BASE_URL}/api/plugins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, prompt }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Plugin creation failed (${res.status})`);
  }

  return res.json();
}

export interface IteratePluginResult {
  pluginId: string;
  versionId: string;
  versionNumber: number;
  faustCode: string;
  params: PluginParam[];
}

export async function iteratePlugin(
  accessToken: string,
  pluginId: string,
  instruction: string
): Promise<IteratePluginResult> {
  const res = await fetch(`${SERVER_BASE_URL}/api/plugins/${pluginId}/iterate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, instruction }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Iteration failed (${res.status})`);
  }

  return res.json();
}

export async function loadPluginThread(
  accessToken: string,
  pluginId: string
): Promise<PluginThread> {
  const res = await fetch(
    `${SERVER_BASE_URL}/api/plugins/${pluginId}?accessToken=${encodeURIComponent(accessToken)}`
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Load failed (${res.status})`);
  }

  return res.json();
}
