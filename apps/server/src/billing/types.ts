export type PlanTier = 'free' | 'unlimited';
export type SubscriptionStatus = 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled';
export type BillingBlockReason = 'node_limit' | 'export_limit' | 'billing_required';

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
    activeNodeLimit: number | null;
    exportsPerDay: number | null;
    sampleAssetsLimit: number | null;
    midiNodeAccess: boolean;
  };
  usage: {
    dailyExportsUsed: number;
    dailyExportsRemaining: number | null;
  };
  contextAccess: BillingAccessResult;
}
