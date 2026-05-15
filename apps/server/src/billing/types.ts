export type PlanTier = 'free' | 'creator' | 'pro' | 'studio';
export type SubscriptionStatus = 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled';
export type BillingBlockReason = 'generation_limit' | 'export_limit' | 'billing_required';

export interface BillingUserRecord {
  clerkUserId: string;
  name: string | null;
  email: string | null;
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  dailyExportDate: string | null;
  dailyExportCount: number;
  dailyGenerationDate: string | null;
  dailyGenerationCount: number;
  monthlyExportMonth: string | null;
  monthlyExportCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface BillingStoreData {
  users: Record<string, BillingUserRecord>;
}

export interface BillingAccessResult {
  allowed: boolean;
  reason: BillingBlockReason | null;
  message: string | null;
}

export interface BillingSnapshot {
  user: {
    clerkUserId: string;
    name: string | null;
    email: string | null;
  };
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  entitlements: {
    generationsPerDay: number | null;
    exportsPerMonth: number | null;
    featureExtraction: boolean;
    apiAccess: boolean;
  };
  usage: {
    dailyGenerationsUsed: number;
    dailyGenerationsRemaining: number | null;
    dailyExportsUsed: number;
    dailyExportsRemaining: number | null;
    monthlyExportsUsed: number;
    monthlyExportsRemaining: number | null;
  };
  contextAccess: BillingAccessResult;
}
