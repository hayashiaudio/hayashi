import { bigint, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

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
    generationCount: integer('generation_count').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    userDateUnique: uniqueIndex('daily_usage_user_date_unique').on(table.userId, table.usageDate),
  })
);

export const monthlyUsage = pgTable(
  'monthly_usage',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.clerkUserId, { onDelete: 'cascade' }),
    usageMonth: text('usage_month').notNull(),
    exportCount: integer('export_count').notNull().default(0),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    userMonthUnique: uniqueIndex('monthly_usage_user_month_unique').on(table.userId, table.usageMonth),
  })
);

export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull().default('synth'),
  generationStatus: text('generation_status').notNull().default('ready'),
  generationError: text('generation_error'),
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
  specJson: jsonb('spec_json'),
  templateId: text('template_id'),
  toneModel: text('tone_model'),
  qualityProfile: text('quality_profile'),
  stereoProfile: text('stereo_profile'),
  macroJson: jsonb('macro_json'),
  uiSpecJson: jsonb('ui_spec_json'),
  evalMetricsJson: jsonb('eval_metrics_json'),
  qualityLabelsJson: jsonb('quality_labels_json'),
  compileErrorsJson: jsonb('compile_errors_json'),
  artifactManifestJson: jsonb('artifact_manifest_json'),
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

export const builds = pgTable('builds', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id')
    .notNull()
    .references(() => plugins.id, { onDelete: 'cascade' }),
  versionId: text('version_id')
    .notNull()
    .references(() => pluginVersions.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').notNull(),
  format: text('format').notNull(),
  target: text('target').notNull().default('vst3-linux-x64'),
  workflowId: text('workflow_id'),
  status: text('status').notNull(),
  stage: text('stage').notNull(),
  statusMessage: text('status_message'),
  filename: text('filename'),
  downloadUrl: text('download_url'),
  errorMessage: text('error_message'),
  startedAt: bigint('started_at', { mode: 'number' }),
  completedAt: bigint('completed_at', { mode: 'number' }),
  metadataJson: jsonb('metadata_json'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const buildLogs = pgTable('build_logs', {
  id: text('id').primaryKey(),
  buildId: text('build_id')
    .notNull()
    .references(() => builds.id, { onDelete: 'cascade' }),
  level: text('level').notNull(),
  stage: text('stage').notNull(),
  source: text('source'),
  message: text('message').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const supportThreads = pgTable('support_threads', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id')
    .notNull()
    .references(() => users.clerkUserId, { onDelete: 'cascade' }),
  discordUserId: text('discord_user_id').notNull(),
  ownerDiscordUserId: text('owner_discord_user_id').notNull(),
  discordChannelId: text('discord_channel_id'),
  title: text('title').notNull(),
  status: text('status').notNull(),
  blockedAt: bigint('blocked_at', { mode: 'number' }),
  blockedReason: text('blocked_reason'),
  contextSummary: text('context_summary'),
  contextJson: jsonb('context_json'),
  lastDiscordMessageId: text('last_discord_message_id'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const supportMessages = pgTable('support_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => supportThreads.id, { onDelete: 'cascade' }),
  authorRole: text('author_role').notNull(),
  content: text('content').notNull(),
  source: text('source').notNull(),
  discordMessageId: text('discord_message_id'),
  metadataJson: jsonb('metadata_json'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const userDiscordOnboarding = pgTable('user_discord_onboarding', {
  clerkUserId: text('clerk_user_id')
    .primaryKey()
    .references(() => users.clerkUserId, { onDelete: 'cascade' }),
  discordUserId: text('discord_user_id').notNull(),
  joinedRoleAssignedAt: bigint('joined_role_assigned_at', { mode: 'number' }),
  termsAcceptedAt: bigint('terms_accepted_at', { mode: 'number' }),
  privacyAcceptedAt: bigint('privacy_accepted_at', { mode: 'number' }),
  termsRoleAssignedAt: bigint('terms_role_assigned_at', { mode: 'number' }),
  privacyRoleAssignedAt: bigint('privacy_role_assigned_at', { mode: 'number' }),
  verifiedRoleAssignedAt: bigint('verified_role_assigned_at', { mode: 'number' }),
  supportDmSentAt: bigint('support_dm_sent_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});
