import type {
  BillingAccessResult,
  BillingSnapshot,
  BillingUserRecord,
  PlanTier,
  SubscriptionStatus,
} from './types.js';
import type { BillingRepository } from './repository.js';

export const FREE_ACTIVE_NODE_LIMIT = 8;
export const FREE_EXPORTS_PER_DAY = 3;
export const FREE_SAMPLE_ASSETS_LIMIT = 5;

export class BillingService {
  constructor(private readonly repository: BillingRepository) {}

  async getOrCreateUser(identity: { userId: string; name?: string | null; email?: string | null }): Promise<BillingUserRecord> {
    const now = Date.now();
    const existing = await this.repository.getUser(identity.userId);
    const next: BillingUserRecord = existing
      ? {
          ...existing,
          name: identity.name ?? existing.name,
          email: identity.email ?? existing.email,
          updatedAt: now,
        }
      : {
          clerkUserId: identity.userId,
          name: identity.name ?? null,
          email: identity.email ?? null,
          plan: 'free',
          subscriptionStatus: 'inactive',
          currentPeriodEnd: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripePriceId: null,
          dailyExportDate: todayKey(),
          dailyExportCount: 0,
          createdAt: now,
          updatedAt: now,
        };
    return this.repository.saveUser(this.resetDailyExportsIfNeeded(next));
  }

  async buildSnapshot(user: BillingUserRecord): Promise<BillingSnapshot> {
    const normalized = this.resetDailyExportsIfNeeded(user);
    await this.repository.saveUser(normalized);
    const dailyExportsRemaining =
      normalized.plan === 'unlimited' ? null : Math.max(0, FREE_EXPORTS_PER_DAY - normalized.dailyExportCount);

    return {
      user: {
        clerkUserId: normalized.clerkUserId,
        name: normalized.name,
        email: normalized.email,
      },
      plan: normalized.plan,
      subscriptionStatus: normalized.subscriptionStatus,
      currentPeriodEnd: normalized.currentPeriodEnd,
      entitlements: {
        activeNodeLimit: normalized.plan === 'unlimited' ? null : FREE_ACTIVE_NODE_LIMIT,
        exportsPerDay: normalized.plan === 'unlimited' ? null : FREE_EXPORTS_PER_DAY,
        sampleAssetsLimit: normalized.plan === 'unlimited' ? null : FREE_SAMPLE_ASSETS_LIMIT,
        midiNodeAccess: normalized.plan === 'unlimited',
      },
      usage: {
        dailyExportsUsed: normalized.dailyExportCount,
        dailyExportsRemaining,
      },
      contextAccess: { allowed: true, reason: null, message: null },
    };
  }

  async authorizeExport(user: BillingUserRecord): Promise<BillingSnapshot> {
    const normalized = this.resetDailyExportsIfNeeded(user);

    if (normalized.plan !== 'unlimited' && normalized.dailyExportCount >= FREE_EXPORTS_PER_DAY) {
      const snapshot = await this.buildSnapshot(await this.repository.saveUser(normalized));
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
    return this.buildSnapshot(saved);
  }

  async syncStripeSubscription(user: BillingUserRecord, subscription: { status: SubscriptionStatus; currentPeriodEnd: number; plan: PlanTier; stripeCustomerId: string; stripeSubscriptionId: string; stripePriceId: string } | null): Promise<BillingUserRecord> {
    if (subscription) {
      user.plan = subscription.plan;
      user.subscriptionStatus = subscription.status;
      user.currentPeriodEnd = subscription.currentPeriodEnd;
      user.stripeCustomerId = subscription.stripeCustomerId;
      user.stripeSubscriptionId = subscription.stripeSubscriptionId;
      user.stripePriceId = subscription.stripePriceId;
    } else {
      user.plan = 'free';
      user.subscriptionStatus = 'inactive';
      user.currentPeriodEnd = null;
    }
    user.updatedAt = Date.now();
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
}

function shouldBeUnlimited(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
