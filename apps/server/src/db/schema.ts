import { bigint, boolean, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  discordUserId: text('discord_user_id').primaryKey(),
  discordUsername: text('discord_username').notNull(),
  discordGlobalName: text('discord_global_name'),
  discordAvatar: text('discord_avatar'),
  discordEmail: text('discord_email'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const billingCustomers = pgTable('billing_customers', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.discordUserId, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').unique(),
  plan: text('plan').notNull(),
  subscriptionStatus: text('subscription_status').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  currentPeriodEnd: bigint('current_period_end', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const installations = pgTable(
  'installations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.discordUserId, { onDelete: 'cascade' }),
    contextType: text('context_type').notNull(),
    contextId: text('context_id').notNull(),
    active: boolean('active').notNull().default(true),
    firstInstalledAt: bigint('first_installed_at', { mode: 'number' }).notNull(),
    lastSeenAt: bigint('last_seen_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    userContextUnique: uniqueIndex('installations_user_context_unique').on(table.userId, table.contextType, table.contextId),
  })
);

export const dailyUsage = pgTable(
  'daily_usage',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.discordUserId, { onDelete: 'cascade' }),
    usageDate: text('usage_date').notNull(),
    exportCount: integer('export_count').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    userDateUnique: uniqueIndex('daily_usage_user_date_unique').on(table.userId, table.usageDate),
  })
);

export const checkoutSessions = pgTable('checkout_sessions', {
  stripeCheckoutSessionId: text('stripe_checkout_session_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.discordUserId, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id'),
  status: text('status').notNull(),
  checkoutUrl: text('checkout_url'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const billingEvents = pgTable('billing_events', {
  stripeEventId: text('stripe_event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  customerId: text('customer_id'),
  subscriptionId: text('subscription_id'),
  payloadJson: text('payload_json').notNull(),
  status: text('status').notNull(),
  processedAt: bigint('processed_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});
