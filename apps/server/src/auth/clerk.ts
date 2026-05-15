import { verifyToken } from '@clerk/backend';

export interface ClerkIdentity {
  userId: string;
  email?: string | null;
  name?: string | null;
}

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
