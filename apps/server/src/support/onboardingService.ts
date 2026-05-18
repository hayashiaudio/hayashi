import { createDmChannel, sendDiscordMessage, addGuildMemberRole, isDiscordGuildMember } from './discord.js';
import { ensureOnboardingRecord, getOnboardingByClerkUserId, getOnboardingByDiscordUserId, updateOnboarding, type UserDiscordOnboardingRecord } from './onboardingRepository.js';

export const SUPPORT_JOINED_ROLE_ID = process.env.SUPPORT_JOINED_ROLE_ID?.trim() || '1503653833199583353';
export const SUPPORT_TERMS_ROLE_ID = process.env.SUPPORT_TERMS_ROLE_ID?.trim() || '1505506067499454505';
export const SUPPORT_PRIVACY_ROLE_ID = process.env.SUPPORT_PRIVACY_ROLE_ID?.trim() || '1505505950881026158';
export const SUPPORT_VERIFIED_ROLE_ID = process.env.SUPPORT_VERIFIED_ROLE_ID?.trim() || '1394049709877891099';
export const SUPPORT_DISCORD_GUILD_ID = process.env.SUPPORT_DISCORD_GUILD_ID?.trim() || '';

export interface SupportOnboardingStatus {
  discordUserId: string;
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

function toStatus(record: UserDiscordOnboardingRecord, inGuild: boolean): SupportOnboardingStatus {
  const acceptedTerms = !!record.termsAcceptedAt;
  const acceptedPrivacy = !!record.privacyAcceptedAt;
  return {
    discordUserId: record.discordUserId,
    inGuild,
    termsAcceptedAt: record.termsAcceptedAt,
    privacyAcceptedAt: record.privacyAcceptedAt,
    joinedRoleAssignedAt: record.joinedRoleAssignedAt,
    termsRoleAssignedAt: record.termsRoleAssignedAt,
    privacyRoleAssignedAt: record.privacyRoleAssignedAt,
    verifiedRoleAssignedAt: record.verifiedRoleAssignedAt,
    supportDmSentAt: record.supportDmSentAt,
    canAccessSupport: inGuild && acceptedTerms && acceptedPrivacy,
  };
}

export async function syncOnboardingForUser(clerkUserId: string, discordUserId: string): Promise<SupportOnboardingStatus> {
  const record = await ensureOnboardingRecord(clerkUserId, discordUserId);
  const inGuild = SUPPORT_DISCORD_GUILD_ID ? await isDiscordGuildMember(SUPPORT_DISCORD_GUILD_ID, discordUserId) : true;
  if (!inGuild || !SUPPORT_DISCORD_GUILD_ID) {
    return toStatus(record, inGuild);
  }

  const now = Date.now();
  const patch: Partial<UserDiscordOnboardingRecord> = {};

  if (SUPPORT_JOINED_ROLE_ID && !record.joinedRoleAssignedAt) {
    await addGuildMemberRole(SUPPORT_DISCORD_GUILD_ID, discordUserId, SUPPORT_JOINED_ROLE_ID);
    patch.joinedRoleAssignedAt = now;
  }
  if (SUPPORT_TERMS_ROLE_ID && record.termsAcceptedAt && !record.termsRoleAssignedAt) {
    await addGuildMemberRole(SUPPORT_DISCORD_GUILD_ID, discordUserId, SUPPORT_TERMS_ROLE_ID);
    patch.termsRoleAssignedAt = now;
  }
  if (SUPPORT_PRIVACY_ROLE_ID && record.privacyAcceptedAt && !record.privacyRoleAssignedAt) {
    await addGuildMemberRole(SUPPORT_DISCORD_GUILD_ID, discordUserId, SUPPORT_PRIVACY_ROLE_ID);
    patch.privacyRoleAssignedAt = now;
  }
  if (SUPPORT_VERIFIED_ROLE_ID && record.termsAcceptedAt && record.privacyAcceptedAt && !record.verifiedRoleAssignedAt) {
    await addGuildMemberRole(SUPPORT_DISCORD_GUILD_ID, discordUserId, SUPPORT_VERIFIED_ROLE_ID);
    patch.verifiedRoleAssignedAt = now;
  }
  if (record.termsAcceptedAt && record.privacyAcceptedAt && !record.supportDmSentAt) {
    const channelId = await createDmChannel(discordUserId);
    await sendDiscordMessage(channelId, {
      embeds: [
        {
          title: 'Support unlocked',
          description: 'Your account is fully onboarded. You can now send messages through the Hayashi /support page.',
          color: 0x4cbf73,
          fields: [
            { name: 'Status', value: 'Verified and ready', inline: true },
            { name: 'Access', value: 'Hayashi support DM bridge', inline: true },
          ],
          footer: { text: 'Hayashi Support' },
          timestamp: new Date(now).toISOString(),
        },
      ],
    });
    patch.supportDmSentAt = now;
  }

  if (Object.keys(patch).length > 0) {
    await updateOnboarding(clerkUserId, patch);
  }
  const latest = (await getOnboardingByClerkUserId(clerkUserId)) ?? { ...record, ...patch, updatedAt: now };
  return toStatus(latest, true);
}

export async function acceptOnboardingPolicy(
  clerkUserId: string,
  discordUserId: string,
  policy: 'terms' | 'privacy'
): Promise<SupportOnboardingStatus> {
  const record = await ensureOnboardingRecord(clerkUserId, discordUserId);
  const now = Date.now();
  if (policy === 'terms' && !record.termsAcceptedAt) {
    await updateOnboarding(clerkUserId, { termsAcceptedAt: now });
  }
  if (policy === 'privacy' && !record.privacyAcceptedAt) {
    await updateOnboarding(clerkUserId, { privacyAcceptedAt: now });
  }
  return syncOnboardingForUser(clerkUserId, discordUserId);
}

export async function getOnboardingStatus(clerkUserId: string, discordUserId: string): Promise<SupportOnboardingStatus> {
  await ensureOnboardingRecord(clerkUserId, discordUserId);
  return syncOnboardingForUser(clerkUserId, discordUserId);
}

export async function handleGuildMemberJoin(discordUserId: string): Promise<void> {
  if (SUPPORT_DISCORD_GUILD_ID && SUPPORT_JOINED_ROLE_ID) {
    await addGuildMemberRole(SUPPORT_DISCORD_GUILD_ID, discordUserId, SUPPORT_JOINED_ROLE_ID);
  }
  const record = await getOnboardingByDiscordUserId(discordUserId);
  if (!record) return;
  await syncOnboardingForUser(record.clerkUserId, discordUserId);
}
