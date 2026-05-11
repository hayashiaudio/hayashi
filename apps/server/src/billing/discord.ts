import type { DiscordIdentity } from './types.js';

export async function fetchDiscordIdentity(accessToken: string): Promise<DiscordIdentity> {
  const response = await fetch('https://discord.com/api/v10/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Discord identity lookup failed');
  }

  return response.json() as Promise<DiscordIdentity>;
}
