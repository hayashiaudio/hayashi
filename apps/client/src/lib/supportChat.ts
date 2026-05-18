import { SERVER_BASE_URL } from './constants';
import { apiFetch, authHeaders } from './http';

export interface SupportMessage {
  id: string;
  threadId: string;
  authorRole: 'customer' | 'support' | 'assistant' | 'system';
  content: string;
  source: 'web' | 'discord' | 'azure' | 'system';
  discordMessageId: string | null;
  metadataJson: {
    author?: {
      discordUserId: string | null;
      displayName: string;
      username: string | null;
      avatarUrl: string | null;
    };
    attachments?: Array<{
      filename: string;
      contentType: string | null;
      url: string;
      size: number | null;
      width: number | null;
      height: number | null;
    }>;
    embeds?: Array<{
      type: string | null;
      url: string | null;
      title: string | null;
      description: string | null;
      imageUrl: string | null;
      thumbnailUrl: string | null;
      providerName: string | null;
    }>;
  } | null;
  createdAt: number;
}

export interface SupportProfile {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface SupportThread {
  id: string;
  clerkUserId: string;
  discordUserId: string;
  ownerDiscordUserId: string;
  discordChannelId: string | null;
  title: string;
  status: 'open' | 'blocked' | 'closed';
  blockedAt: number | null;
  blockedReason: string | null;
  contextSummary: string | null;
  contextJson: {
    sentiment?: string;
    urgency?: string;
    issues?: string[];
    nextStep?: string;
  } | null;
  lastDiscordMessageId: string | null;
  createdAt: number;
  updatedAt: number;
  ownerProfile: SupportProfile;
  customerProfile: SupportProfile;
  messages: SupportMessage[];
}

export interface SupportSession {
  clerkUserId: string;
  discordUserId: string;
  discordUsername: string | null;
  isOwner: boolean;
  ownerDiscordUserId: string;
  canSendMessages: boolean;
  requiresDiscordJoin: boolean;
  requiresTermsAcceptance: boolean;
  requiresPrivacyAcceptance: boolean;
  joinDiscordUrl: string | null;
  termsAcceptedAt: number | null;
  privacyAcceptedAt: number | null;
  ownerProfile: SupportProfile;
  threads: Array<Omit<SupportThread, 'messages'> & { messages?: SupportMessage[] }>;
}

export async function loadSupportSession(token: string | null, userId?: string | null) {
  const url = new URL(`${SERVER_BASE_URL}/api/support/session`);
  if (token) url.searchParams.set('accessToken', token);
  if (userId) url.searchParams.set('userId', userId);
  const res = await apiFetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Support session failed (${res.status})`);
  }
  return res.json() as Promise<SupportSession>;
}

export async function createSupportThread(token: string | null, userId: string, title: string, message: string, files: File[] = []) {
  const form = new FormData();
  form.set('userId', userId);
  form.set('title', title);
  form.set('message', message);
  files.forEach((file) => form.append('files', file));
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await apiFetch(`${SERVER_BASE_URL}/api/support/threads`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Create support thread failed (${res.status})`);
  }
  return res.json() as Promise<SupportThread>;
}

export async function loadSupportThread(token: string | null, threadId: string, userId?: string | null) {
  const url = new URL(`${SERVER_BASE_URL}/api/support/threads/${encodeURIComponent(threadId)}`);
  if (token) url.searchParams.set('accessToken', token);
  if (userId) url.searchParams.set('userId', userId);
  const res = await apiFetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Load support thread failed (${res.status})`);
  }
  return res.json() as Promise<SupportThread>;
}

export async function sendSupportMessage(token: string | null, threadId: string, userId: string, content: string, files: File[] = []) {
  const form = new FormData();
  form.set('userId', userId);
  form.set('content', content);
  files.forEach((file) => form.append('files', file));
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await apiFetch(`${SERVER_BASE_URL}/api/support/threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Send support message failed (${res.status})`);
  }
  return res.json() as Promise<SupportThread>;
}

export async function blockSupportThread(token: string | null, threadId: string, reason: string) {
  const res = await apiFetch(`${SERVER_BASE_URL}/api/support/threads/${encodeURIComponent(threadId)}/block`, {
    method: 'POST',
    headers: await authHeaders(token),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Block support thread failed (${res.status})`);
  }
  return res.json() as Promise<SupportThread>;
}
