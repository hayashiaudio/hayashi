interface DiscordCreateDmResponse {
  id: string;
}

interface DiscordMessageResponse {
  id: string;
  content: string;
  author?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    bot?: boolean;
  };
  attachments?: Array<{
    id: string;
    filename: string;
    content_type?: string | null;
    size?: number;
    url?: string;
    proxy_url?: string;
    width?: number | null;
    height?: number | null;
  }>;
  embeds?: Array<{
    type?: string;
    url?: string;
    title?: string;
    description?: string;
    thumbnail?: { url?: string };
    image?: { url?: string; width?: number; height?: number };
    video?: { url?: string; width?: number; height?: number };
    provider?: { name?: string };
  }>;
  timestamp?: string;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordOutboundEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
  thumbnail?: {
    url: string;
  };
}

interface DiscordUserResponse {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface DiscordGuildMemberResponse {
  user?: DiscordUserResponse;
  nick?: string | null;
  avatar?: string | null;
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN?.trim() ?? '';

interface DiscordErrorResponse {
  message?: string;
  code?: number;
}

export class DiscordApiError extends Error {
  status: number;
  code: number | null;
  details: string;

  constructor(status: number, details: string, code: number | null = null) {
    super(`Discord API error (${status}): ${details}`);
    this.name = 'DiscordApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function discordHeaders() {
  if (!DISCORD_BOT_TOKEN) {
    throw new Error('DISCORD_BOT_TOKEN is not configured');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  };
}

function buildDiscordAvatarUrl(userId: string, avatarHash: string | null | undefined, guildId?: string) {
  if (!avatarHash) return null;
  if (guildId) {
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${avatarHash}.png?size=128`;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`;
}

async function discordFetch(path: string, init?: RequestInit) {
  const isMultipart = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const baseHeaders = discordHeaders();
  if (isMultipart) {
    delete (baseHeaders as Record<string, string>)['Content-Type'];
  }
  const res = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers: {
      ...baseHeaders,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let parsed: DiscordErrorResponse | null = null;
    try {
      parsed = text ? JSON.parse(text) as DiscordErrorResponse : null;
    } catch {
      parsed = null;
    }
    throw new DiscordApiError(res.status, parsed?.message ?? text ?? 'Unknown Discord API error', parsed?.code ?? null);
  }
  return res;
}

export function isDiscordMutualGuildError(error: unknown): boolean {
  return error instanceof DiscordApiError && error.code === 50278;
}

export async function createDmChannel(recipientUserId: string): Promise<string> {
  const res = await discordFetch('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: recipientUserId }),
  });
  const data = await res.json() as DiscordCreateDmResponse;
  if (!data.id) throw new Error('Discord DM channel creation returned no id');
  return data.id;
}

export async function sendDiscordMessage(
  channelId: string,
  options: {
    content?: string;
    embeds?: DiscordOutboundEmbed[];
    files?: Array<{ name: string; contentType: string; bytes: Uint8Array }>;
  }
): Promise<DiscordMessageResponse> {
  const content = options.content?.trim() ?? '';
  const embeds = options.embeds ?? [];
  const files = options.files;
  const hasFiles = !!files?.length;
  let body: FormData | string;
  if (hasFiles) {
    const form = new FormData();
    form.set('payload_json', JSON.stringify({ content, embeds }));
    files?.forEach((file, index) => {
      form.set(`files[${index}]`, new Blob([new Uint8Array(file.bytes)], { type: file.contentType }), file.name);
    });
    body = form;
  } else {
    body = JSON.stringify({ content, embeds });
  }
  const res = await discordFetch(`/channels/${encodeURIComponent(channelId)}/messages`, {
    method: 'POST',
    headers: hasFiles ? { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } : undefined,
    body,
  });
  const data = await res.json() as DiscordMessageResponse;
  if (!data.id) throw new Error('Discord message send returned no id');
  return data;
}

export async function addDiscordReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
  await discordFetch(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}/@me`, {
    method: 'PUT',
  });
}

export async function listDiscordMessages(channelId: string, limit = 50): Promise<DiscordMessageResponse[]> {
  const res = await discordFetch(`/channels/${encodeURIComponent(channelId)}/messages?limit=${Math.max(1, Math.min(limit, 100))}`);
  return res.json() as Promise<DiscordMessageResponse[]>;
}

export async function isDiscordGuildMember(guildId: string, userId: string): Promise<boolean> {
  try {
    await discordFetch(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`);
    return true;
  } catch (error) {
    if (error instanceof DiscordApiError && error.status === 404) return false;
    throw error;
  }
}

export async function addGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
  await discordFetch(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, {
    method: 'PUT',
  });
}

export async function removeGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
  await discordFetch(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE',
  });
}

export interface DiscordProfile {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export async function getDiscordUserProfile(userId: string): Promise<DiscordProfile> {
  const res = await discordFetch(`/users/${encodeURIComponent(userId)}`);
  const data = await res.json() as DiscordUserResponse;
  return {
    discordUserId: data.id,
    username: data.username,
    displayName: data.global_name || data.username,
    avatarUrl: buildDiscordAvatarUrl(data.id, data.avatar),
  };
}

export async function getDiscordGuildMemberProfile(guildId: string, userId: string): Promise<DiscordProfile> {
  const res = await discordFetch(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`);
  const data = await res.json() as DiscordGuildMemberResponse;
  const user = data.user;
  if (!user?.id || !user.username) {
    throw new Error(`Discord guild member profile for ${userId} returned no user payload`);
  }
  return {
    discordUserId: user.id,
    username: user.username,
    displayName: data.nick || user.global_name || user.username,
    avatarUrl: buildDiscordAvatarUrl(user.id, data.avatar || user.avatar, data.avatar ? guildId : undefined),
  };
}
