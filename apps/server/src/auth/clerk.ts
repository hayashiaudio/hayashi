import { createClerkClient, verifyToken } from '@clerk/backend';

export interface ClerkIdentity {
  userId: string;
  email?: string | null;
  name?: string | null;
}

export interface ClerkPublicProfile {
  userId: string;
  name: string | null;
  imageUrl: string | null;
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function verifyClerkToken(token: string): Promise<ClerkIdentity | null> {
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    return {
      userId: payload.sub as string,
      email: (payload.email as string | undefined) ?? null,
      name: ((payload.first_name as string | undefined) && (payload.last_name as string | undefined))
        ? `${payload.first_name} ${payload.last_name}`
        : (payload.username as string | undefined) ?? null,
    };
  } catch (err) {
    console.error('[Hayashi] Clerk token verification failed:', err);
    return null;
  }
}

export interface DiscordAccountIdentity {
  provider: string;
  providerUserId: string;
  username: string | null;
}

export async function getDiscordAccountForUser(userId: string): Promise<DiscordAccountIdentity | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const account = user.externalAccounts.find((item) =>
      item.provider === 'discord' || item.provider === 'oauth_discord'
    );
    if (!account?.providerUserId) return null;
    return {
      provider: account.provider,
      providerUserId: account.providerUserId,
      username: account.username ?? null,
    };
  } catch (err) {
    console.error('[Hayashi] Failed to load Clerk Discord account:', err);
    return null;
  }
}

export async function getClerkPublicProfile(userId: string): Promise<ClerkPublicProfile | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const name = user.fullName ?? (fullName || user.username || null);

    return {
      userId: user.id,
      name,
      imageUrl: user.imageUrl ?? null,
    };
  } catch (err) {
    console.error('[Hayashi] Failed to load Clerk public profile:', err);
    return null;
  }
}
