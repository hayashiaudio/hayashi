const DISCORD_API_BASE = 'https://discord.com/api/v10';

export interface DiscordEntitlement {
  id: string;
  sku_id: string;
  application_id: string;
  user_id?: string;
  type: number;
  deleted: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

function requireBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not configured');
  return token;
}

function requireApplicationId(): string {
  const id = process.env.DISCORD_CLIENT_ID ?? process.env.VITE_DISCORD_CLIENT_ID;
  if (!id) throw new Error('DISCORD_CLIENT_ID is not configured');
  return id;
}

export async function fetchDiscordEntitlements(discordUserId: string): Promise<DiscordEntitlement[]> {
  const appId = requireApplicationId();
  const botToken = requireBotToken();

  const url = new URL(`${DISCORD_API_BASE}/applications/${appId}/entitlements`);
  url.searchParams.set('user_id', discordUserId);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string }).message ?? `Discord entitlements request failed (${response.status})`
    );
  }

  const entitlements = (await response.json()) as DiscordEntitlement[];
  return entitlements.filter((e) => !e.deleted);
}

export function findUnlimitedEntitlement(
  entitlements: DiscordEntitlement[],
  unlimitedSkuId?: string
): DiscordEntitlement | null {
  if (!unlimitedSkuId) return null;
  return entitlements.find((e) => e.sku_id === unlimitedSkuId) ?? null;
}
