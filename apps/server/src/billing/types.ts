export type PlanTier = 'free' | 'unlimited';
export type SubscriptionStatus = 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled';
export type BillingBlockReason = 'installation_limit' | 'node_limit' | 'export_limit' | 'billing_required';
export type ContextType = 'guild' | 'dm';

export interface BillingContext {
  type: ContextType;
  id: string;
}

export interface BillingUserRecord {
  discordUserId: string;
  discordUsername: string;
  discordGlobalName: string | null;
  discordAvatar: string | null;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  guildInstallationId: string | null;
  dmInstallationId: string | null;
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
    discordUserId: string;
    discordUsername: string;
    discordAvatar: string | null;
    email: string | null;
  };
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
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
  contextAccess: BillingAccessResult;
}

export interface DiscordIdentity {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
}

export interface CheckoutSessionRecord {
  stripeCheckoutSessionId: string;
  userId: string;
  stripeCustomerId: string | null;
  status: string;
  checkoutUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BillingEventRecord {
  stripeEventId: string;
  eventType: string;
  customerId: string | null;
  subscriptionId: string | null;
  payloadJson: string;
  status: string;
  processedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
