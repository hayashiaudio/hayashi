import { IS_LOCAL_DEV, SERVER_BASE_URL } from './constants';

export async function saveProjectSnapshot(projectId: string, snapshot: unknown) {
  if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) {
    return { skipped: true };
  }
  const res = await fetch(`${SERVER_BASE_URL}/project/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, snapshot }),
  });
  if (!res.ok) throw new Error('Failed to save project');
  return res.json();
}

export async function loadProjectSnapshot(projectId: string) {
  if (IS_LOCAL_DEV && SERVER_BASE_URL.includes('trycloudflare.com')) {
    return { snapshot: undefined };
  }
  const res = await fetch(`${SERVER_BASE_URL}/project/load/${projectId}`);
  if (!res.ok) throw new Error('Failed to load project');
  return res.json();
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
