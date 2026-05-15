import { bigint, boolean, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  clerkUserId: text('clerk_user_id').primaryKey(),
  name: text('name'),
  email: text('email'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const billingCustomers = pgTable('billing_customers', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.clerkUserId, { onDelete: 'cascade' }),
  plan: text('plan').notNull(),
  subscriptionStatus: text('subscription_status').notNull(),
  currentPeriodEnd: bigint('current_period_end', { mode: 'number' }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripePriceId: text('stripe_price_id'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const dailyUsage = pgTable(
  'daily_usage',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.clerkUserId, { onDelete: 'cascade' }),
    usageDate: text('usage_date').notNull(),
    exportCount: integer('export_count').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    userDateUnique: uniqueIndex('daily_usage_user_date_unique').on(table.userId, table.usageDate),
  })
);

export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull().default('synth'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const pluginVersions = pgTable('plugin_versions', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id')
    .notNull()
    .references(() => plugins.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  prompt: text('prompt').notNull(),
  faustCode: text('faust_code').notNull(),
  paramsJson: text('params_json').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const pluginMessages = pgTable('plugin_messages', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id')
    .notNull()
    .references(() => plugins.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  versionId: text('version_id').references(() => pluginVersions.id, { onDelete: 'cascade' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
