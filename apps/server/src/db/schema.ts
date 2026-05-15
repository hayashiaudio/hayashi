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
  plan: text('plan').notNull(),
  subscriptionStatus: text('subscription_status').notNull(),
  currentPeriodEnd: bigint('current_period_end', { mode: 'number' }),
  discordEntitlementSkuId: text('discord_entitlement_sku_id'),
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

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  channelId: text('channel_id'),
  title: text('title').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const yjsUpdates = pgTable('yjs_updates', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  docName: text('doc_name').notNull(),
  updateData: text('update_data').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

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
