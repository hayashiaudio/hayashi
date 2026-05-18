import { SERVER_BASE_URL } from './constants';
import { apiFetch, authHeaders } from './http';

export interface OnboardingStatus {
  clerkUserId: string;
  discordUserId: string;
  discordUsername: string | null;
  joinDiscordUrl: string | null;
  supportGuildId: string | null;
  joinedRoleId: string | null;
  termsRoleId: string | null;
  privacyRoleId: string | null;
  verifiedRoleId: string | null;
  inGuild: boolean;
  termsAcceptedAt: number | null;
  privacyAcceptedAt: number | null;
  joinedRoleAssignedAt: number | null;
  termsRoleAssignedAt: number | null;
  privacyRoleAssignedAt: number | null;
  verifiedRoleAssignedAt: number | null;
  supportDmSentAt: number | null;
  canAccessSupport: boolean;
}

export async function loadOnboardingStatus(token: string | null, userId?: string | null) {
  const url = new URL(`${SERVER_BASE_URL}/api/onboarding/status`);
  if (token) url.searchParams.set('accessToken', token);
  if (userId) url.searchParams.set('userId', userId);
  const res = await apiFetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Onboarding status failed (${res.status})`);
  }
  return res.json() as Promise<OnboardingStatus>;
}

export async function acceptOnboardingPolicy(token: string | null, userId: string, policy: 'terms' | 'privacy') {
  const res = await apiFetch(`${SERVER_BASE_URL}/api/onboarding/accept`, {
    method: 'POST',
    headers: await authHeaders(token),
    body: JSON.stringify({ userId, policy }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Accept onboarding policy failed (${res.status})`);
  }
  return res.json() as Promise<OnboardingStatus>;
}
