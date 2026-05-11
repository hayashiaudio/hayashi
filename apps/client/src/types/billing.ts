export type BillingPlan = 'free' | 'unlimited';
export type BillingStatus = 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled';
export type BillingBlockReason = 'installation_limit' | 'node_limit' | 'export_limit' | 'billing_required';

export interface BillingSnapshot {
  user: {
    discordUserId: string;
    discordUsername: string;
    discordAvatar: string | null;
    email: string | null;
  };
  plan: BillingPlan;
  subscriptionStatus: BillingStatus;
  currentPeriodEnd: number | null;
  stripeCustomerId: string | null;
  entitlements: {
    activeNodeLimit: number | null;
    exportsPerDay: number | null;
    guildInstallations: number | null;
    dmInstallations: number | null;
  };
  usage: {
    dailyExportsUsed: number;
    dailyExportsRemaining: number | null;
    guildInstallationId: string | null;
    dmInstallationId: string | null;
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
