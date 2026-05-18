import { eq } from 'drizzle-orm';
import { getDb, ensureDbSchema } from '../db/index.js';
import { userDiscordOnboarding } from '../db/schema.js';

export interface UserDiscordOnboardingRecord {
  clerkUserId: string;
  discordUserId: string;
  joinedRoleAssignedAt: number | null;
  termsAcceptedAt: number | null;
  privacyAcceptedAt: number | null;
  termsRoleAssignedAt: number | null;
  privacyRoleAssignedAt: number | null;
  verifiedRoleAssignedAt: number | null;
  supportDmSentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export async function getOnboardingByClerkUserId(clerkUserId: string): Promise<UserDiscordOnboardingRecord | null> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db.select().from(userDiscordOnboarding).where(eq(userDiscordOnboarding.clerkUserId, clerkUserId)).limit(1);
  return (rows[0] as UserDiscordOnboardingRecord | undefined) ?? null;
}

export async function getOnboardingByDiscordUserId(discordUserId: string): Promise<UserDiscordOnboardingRecord | null> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db.select().from(userDiscordOnboarding).where(eq(userDiscordOnboarding.discordUserId, discordUserId)).limit(1);
  return (rows[0] as UserDiscordOnboardingRecord | undefined) ?? null;
}

export async function ensureOnboardingRecord(clerkUserId: string, discordUserId: string): Promise<UserDiscordOnboardingRecord> {
  const existing = await getOnboardingByClerkUserId(clerkUserId);
  const now = Date.now();
  if (existing) {
    if (existing.discordUserId === discordUserId) return existing;
    await updateOnboarding(clerkUserId, { discordUserId, updatedAt: now });
    return (await getOnboardingByClerkUserId(clerkUserId)) ?? {
      ...existing,
      discordUserId,
      updatedAt: now,
    };
  }

  await ensureDbSchema();
  const db = getDb();
  await db.insert(userDiscordOnboarding).values({
    clerkUserId,
    discordUserId,
    joinedRoleAssignedAt: null,
    termsAcceptedAt: null,
    privacyAcceptedAt: null,
    termsRoleAssignedAt: null,
    privacyRoleAssignedAt: null,
    verifiedRoleAssignedAt: null,
    supportDmSentAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return (await getOnboardingByClerkUserId(clerkUserId)) as UserDiscordOnboardingRecord;
}

export async function updateOnboarding(
  clerkUserId: string,
  patch: Partial<Omit<UserDiscordOnboardingRecord, 'clerkUserId' | 'createdAt'>>
): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  await db.update(userDiscordOnboarding).set({
    ...patch,
    updatedAt: patch.updatedAt ?? Date.now(),
  }).where(eq(userDiscordOnboarding.clerkUserId, clerkUserId));
}
