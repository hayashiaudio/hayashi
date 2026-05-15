export type BillingPlan = 'free' | 'creator' | 'pro' | 'studio';
export type BillingStatus = 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled';
export type BillingBlockReason = 'generation_limit' | 'export_limit' | 'billing_required';

export interface BillingSnapshot {
  user: {
    clerkUserId: string;
    name: string | null;
    email: string | null;
  };
  plan: BillingPlan;
  subscriptionStatus: BillingStatus;
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
  contextAccess: {
    allowed: boolean;
    reason: BillingBlockReason | null;
    message: string | null;
  };
}

export interface BillingState {
  loading: boolean;
  snapshot: BillingSnapshot | null;
  error: string | null;
  paywallOpen: boolean;
  paywallReason: BillingBlockReason | null;
  paywallMessage: string | null;
}
