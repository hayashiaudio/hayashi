import type {
  BillingAccessResult,
  BillingSnapshot,
  BillingUserRecord,
  PlanTier,
  SubscriptionStatus,
} from './types.js';
import type { BillingRepository } from './repository.js';

export const FREE_GENERATIONS_PER_DAY = 5;
export const CREATOR_EXPORTS_PER_MONTH = 10;
export const PRO_EXPORTS_PER_MONTH = 20;
export const STUDIO_EXPORTS_PER_MONTH = null; // unlimited

export const STRIPE_PRICE_CREATOR = 'price_1TXTu5CmEpq5jdTPiQehqZvr';
export const STRIPE_PRICE_PRO = 'price_1TXUAYCmEpq5jdTP6C6Rv9rr';
export const STRIPE_PRICE_STUDIO = 'prod_UWXJLmrcYuXhQb';

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
          dailyGenerationDate: todayKey(),
          dailyGenerationCount: 0,
          monthlyExportMonth: monthKey(),
          monthlyExportCount: 0,
          createdAt: now,
          updatedAt: now,
        };
    return this.repository.saveUser(this.resetCountersIfNeeded(next));
  }

  async buildSnapshot(user: BillingUserRecord): Promise<BillingSnapshot> {
    const normalized = this.resetCountersIfNeeded(user);
    await this.repository.saveUser(normalized);

    const entitlements = getPlanEntitlements(normalized.plan);

    return {
      user: {
        clerkUserId: normalized.clerkUserId,
        name: normalized.name,
        email: normalized.email,
      },
      plan: normalized.plan,
      subscriptionStatus: normalized.subscriptionStatus,
      currentPeriodEnd: normalized.currentPeriodEnd,
      entitlements,
      usage: {
        dailyGenerationsUsed: normalized.dailyGenerationCount,
        dailyGenerationsRemaining: entitlements.generationsPerDay === null ? null : Math.max(0, entitlements.generationsPerDay - normalized.dailyGenerationCount),
        dailyExportsUsed: normalized.dailyExportCount,
        dailyExportsRemaining: null, // we track monthly exports now, not daily
        monthlyExportsUsed: normalized.monthlyExportCount,
        monthlyExportsRemaining: entitlements.exportsPerMonth === null ? null : Math.max(0, entitlements.exportsPerMonth - normalized.monthlyExportCount),
      },
      contextAccess: { allowed: true, reason: null, message: null },
    };
  }

  async authorizeGeneration(user: BillingUserRecord): Promise<BillingSnapshot> {
    const normalized = this.resetCountersIfNeeded(user);
    const entitlements = getPlanEntitlements(normalized.plan);

    if (entitlements.generationsPerDay !== null && normalized.dailyGenerationCount >= entitlements.generationsPerDay) {
      const snapshot = await this.buildSnapshot(await this.repository.saveUser(normalized));
      return {
        ...snapshot,
        contextAccess: {
          allowed: false,
          reason: 'generation_limit',
          message: `Free members can generate up to ${FREE_GENERATIONS_PER_DAY} plugins per day. Upgrade to Creator for unlimited generations.`,
        },
      };
    }

    normalized.dailyGenerationCount += 1;
    normalized.updatedAt = Date.now();
    const saved = await this.repository.saveUser(normalized);
    return this.buildSnapshot(saved);
  }

  async authorizeExport(user: BillingUserRecord): Promise<BillingSnapshot> {
    const normalized = this.resetCountersIfNeeded(user);
    const entitlements = getPlanEntitlements(normalized.plan);

    if (normalized.plan === 'free') {
      const snapshot = await this.buildSnapshot(await this.repository.saveUser(normalized));
      return {
        ...snapshot,
        contextAccess: {
          allowed: false,
          reason: 'export_limit',
          message: 'Exporting plugins requires a Creator plan or higher. Upgrade to export VST3 and CLAP binaries.',
        },
      };
    }

    if (entitlements.exportsPerMonth !== null && normalized.monthlyExportCount >= entitlements.exportsPerMonth) {
      const snapshot = await this.buildSnapshot(await this.repository.saveUser(normalized));
      return {
        ...snapshot,
        contextAccess: {
          allowed: false,
          reason: 'export_limit',
          message: `Your plan includes ${entitlements.exportsPerMonth} exports per month. Upgrade for more.`,
        },
      };
    }

    if (entitlements.exportsPerMonth !== null) normalized.monthlyExportCount += 1;
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

  private resetCountersIfNeeded(user: BillingUserRecord): BillingUserRecord {
    const today = todayKey();
    if (user.dailyExportDate !== today) {
      user.dailyExportDate = today;
      user.dailyExportCount = 0;
    }
    if (user.dailyGenerationDate !== today) {
      user.dailyGenerationDate = today;
      user.dailyGenerationCount = 0;
    }
    const currentMonth = monthKey();
    if (user.monthlyExportMonth !== currentMonth) {
      user.monthlyExportMonth = currentMonth;
      user.monthlyExportCount = 0;
    }
    return user;
  }
}

export function getPlanEntitlements(plan: PlanTier) {
  switch (plan) {
    case 'free':
      return {
        generationsPerDay: FREE_GENERATIONS_PER_DAY,
        exportsPerMonth: 0,
        featureExtraction: false,
        apiAccess: false,
      };
    case 'creator':
      return {
        generationsPerDay: null,
        exportsPerMonth: CREATOR_EXPORTS_PER_MONTH,
        featureExtraction: false,
        apiAccess: false,
      };
    case 'pro':
      return {
        generationsPerDay: null,
        exportsPerMonth: PRO_EXPORTS_PER_MONTH,
        featureExtraction: true,
        apiAccess: false,
      };
    case 'studio':
      return {
        generationsPerDay: null,
        exportsPerMonth: STUDIO_EXPORTS_PER_MONTH,
        featureExtraction: true,
        apiAccess: true,
      };
  }
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}
