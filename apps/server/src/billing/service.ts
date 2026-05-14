import type {
  BillingAccessResult,
  BillingContext,
  BillingSnapshot,
  BillingUserRecord,
  DiscordIdentity,
  PlanTier,
  SubscriptionStatus,
} from './types.js';
import type { BillingRepository } from './repository.js';
import { fetchDiscordEntitlements, findUnlimitedEntitlement } from './discordEntitlements.js';

export const FREE_ACTIVE_NODE_LIMIT = 8;
export const FREE_EXPORTS_PER_DAY = 3;
export const FREE_SAMPLE_ASSETS_LIMIT = 5;
export const DISCORD_UNLIMITED_SKU_ID = process.env.DISCORD_UNLIMITED_SKU_ID ?? '';

export class BillingService {
  constructor(private readonly repository: BillingRepository) {}

  async getOrCreateUser(identity: DiscordIdentity): Promise<BillingUserRecord> {
    const now = Date.now();
    const existing = await this.repository.getUser(identity.id);
    const next: BillingUserRecord = existing
      ? {
          ...existing,
          discordUsername: identity.global_name ?? identity.username,
          discordGlobalName: identity.global_name ?? existing.discordGlobalName,
          discordAvatar: identity.avatar ?? existing.discordAvatar,
          email: identity.email ?? existing.email,
          updatedAt: now,
        }
      : {
          discordUserId: identity.id,
          discordUsername: identity.global_name ?? identity.username,
          discordGlobalName: identity.global_name ?? null,
          discordAvatar: identity.avatar ?? null,
          email: identity.email ?? null,
          discordEntitlementSkuId: null,
          plan: 'free',
          subscriptionStatus: 'inactive',
          currentPeriodEnd: null,
          guildInstallationId: null,
          dmInstallationId: null,
          dailyExportDate: todayKey(),
          dailyExportCount: 0,
          createdAt: now,
          updatedAt: now,
        };
    return this.repository.saveUser(this.resetDailyExportsIfNeeded(next));
  }

  async buildSnapshot(user: BillingUserRecord, context: BillingContext | null): Promise<BillingSnapshot> {
    const normalized = this.resetDailyExportsIfNeeded(user);
    await this.repository.saveUser(normalized);
    const access = this.ensureContextAccess(normalized, context, false);
    const dailyExportsRemaining =
      normalized.plan === 'unlimited' ? null : Math.max(0, FREE_EXPORTS_PER_DAY - normalized.dailyExportCount);

    return {
      user: {
        discordUserId: normalized.discordUserId,
        discordUsername: normalized.discordUsername,
        discordAvatar: normalized.discordAvatar,
        email: normalized.email,
      },
      plan: normalized.plan,
      subscriptionStatus: normalized.subscriptionStatus,
      currentPeriodEnd: normalized.currentPeriodEnd,
      entitlements: {
        activeNodeLimit: normalized.plan === 'unlimited' ? null : FREE_ACTIVE_NODE_LIMIT,
        exportsPerDay: normalized.plan === 'unlimited' ? null : FREE_EXPORTS_PER_DAY,
        guildInstallations: normalized.plan === 'unlimited' ? null : 1,
        dmInstallations: normalized.plan === 'unlimited' ? null : 1,
        sampleAssetsLimit: normalized.plan === 'unlimited' ? null : FREE_SAMPLE_ASSETS_LIMIT,
        midiNodeAccess: normalized.plan === 'unlimited',
      },
      usage: {
        dailyExportsUsed: normalized.dailyExportCount,
        dailyExportsRemaining,
        guildInstallationId: normalized.guildInstallationId,
        dmInstallationId: normalized.dmInstallationId,
      },
      contextAccess: access,
    };
  }

  async registerContext(user: BillingUserRecord, context: BillingContext | null): Promise<BillingSnapshot> {
    const normalized = this.resetDailyExportsIfNeeded(user);
    this.ensureContextAccess(normalized, context, true);
    return this.buildSnapshot(await this.repository.saveUser(normalized), context);
  }

  async authorizeExport(user: BillingUserRecord, context: BillingContext | null): Promise<BillingSnapshot> {
    const normalized = this.resetDailyExportsIfNeeded(user);
    const access = this.ensureContextAccess(normalized, context, true);
    if (!access.allowed) {
      await this.repository.saveUser(normalized);
      return this.buildSnapshot(normalized, context);
    }

    if (normalized.plan !== 'unlimited' && normalized.dailyExportCount >= FREE_EXPORTS_PER_DAY) {
      const snapshot = await this.buildSnapshot(await this.repository.saveUser(normalized), context);
      return {
        ...snapshot,
        contextAccess: {
          allowed: false,
          reason: 'export_limit',
          message: 'Free members can export up to 3 times per day. Upgrade to Hayashi Unlimited for unlimited exports.',
        },
      };
    }

    if (normalized.plan !== 'unlimited') normalized.dailyExportCount += 1;
    normalized.updatedAt = Date.now();
    const saved = await this.repository.saveUser(normalized);
    return this.buildSnapshot(saved, context);
  }

  async syncEntitlements(user: BillingUserRecord): Promise<BillingUserRecord> {
    try {
      const entitlements = await fetchDiscordEntitlements(user.discordUserId);
      const unlimited = findUnlimitedEntitlement(entitlements, DISCORD_UNLIMITED_SKU_ID);

      user.plan = unlimited ? 'unlimited' : 'free';
      user.subscriptionStatus = unlimited ? 'active' : 'inactive';
      user.currentPeriodEnd = unlimited?.ends_at ? new Date(unlimited.ends_at).getTime() : null;
      user.discordEntitlementSkuId = unlimited?.sku_id ?? null;
      user.updatedAt = Date.now();
    } catch {
      // If Discord API fails, preserve existing plan state
    }
    return this.repository.saveUser(user);
  }

  private resetDailyExportsIfNeeded(user: BillingUserRecord): BillingUserRecord {
    const today = todayKey();
    if (user.dailyExportDate !== today) {
      user.dailyExportDate = today;
      user.dailyExportCount = 0;
    }
    return user;
  }

  private ensureContextAccess(
    user: BillingUserRecord,
    context: BillingContext | null,
    persist: boolean
  ): BillingAccessResult {
    if (!context || user.plan === 'unlimited') {
      return { allowed: true, reason: null, message: null };
    }

    const current = context.type === 'guild' ? user.guildInstallationId : user.dmInstallationId;
    if (!current || current === context.id) {
      if (persist) {
        if (context.type === 'guild') user.guildInstallationId = context.id;
        else user.dmInstallationId = context.id;
        user.updatedAt = Date.now();
      }
      return { allowed: true, reason: null, message: null };
    }

    const label = context.type === 'guild' ? 'server' : 'DM conversation';
    return {
      allowed: false,
      reason: 'installation_limit',
      message: `Free members can keep 1 active ${label} installation. Upgrade to Hayashi Unlimited to use Hayashi everywhere.`,
    };
  }
}

function shouldBeUnlimited(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function buildBillingContext(guildId?: string | null, channelId?: string | null): BillingContext | null {
  if (guildId) return { type: 'guild', id: guildId };
  if (channelId) return { type: 'dm', id: channelId };
  return null;
}
