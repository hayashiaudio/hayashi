import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';

let client: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let initialized: Promise<void> | null = null;

function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? '';
}

export function hasDatabaseUrl(): boolean {
  return Boolean(getDatabaseUrl());
}

export function getDb() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!client) {
    client = postgres(databaseUrl, {
      ssl: 'require',
      max: 10,
      prepare: false,
    });
  }

  if (!db) {
    db = drizzle(client, { schema });
  }

  return db;
}

export async function ensureDbSchema() {
  if (!initialized) {
    initialized = (async () => {
      const database = getDb();

      await database.execute(sql`drop table if exists checkout_sessions`);
      await database.execute(sql`drop table if exists billing_events`);
      await database.execute(sql`drop table if exists installations`);
      await database.execute(sql`drop table if exists projects`);
      await database.execute(sql`drop table if exists yjs_updates`);

      // Migrate discord_user_id -> clerk_user_id in users table
      // If the old column still exists, drop the table cascade (to clear dependent FKs)
      // and let create table if not exists rebuild it cleanly.
      await database.execute(sql`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'discord_user_id'
          ) THEN
            DROP TABLE IF EXISTS users CASCADE;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Users table drop failed (may not exist): %', SQLERRM;
        END $$;
      `);

      await database.execute(sql`
        create table if not exists users (
          clerk_user_id text primary key,
          name text,
          email text,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);

      await database.execute(sql`
        create table if not exists billing_customers (
          user_id text primary key references users(clerk_user_id) on delete cascade,
          plan text not null,
          subscription_status text not null,
          current_period_end bigint,
          stripe_customer_id text,
          stripe_subscription_id text,
          stripe_price_id text,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);

      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS stripe_customer_id text;
          ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
          ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS stripe_price_id text;
          ALTER TABLE billing_customers DROP COLUMN IF EXISTS discord_entitlement_sku_id;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);

      await database.execute(sql`
        create table if not exists daily_usage (
          id text primary key,
          user_id text not null references users(clerk_user_id) on delete cascade,
          usage_date text not null,
          export_count integer not null default 0,
          generation_count integer not null default 0,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
      await database.execute(sql`
        create unique index if not exists daily_usage_user_date_unique
        on daily_usage(user_id, usage_date)
      `);

      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE daily_usage ADD COLUMN IF NOT EXISTS generation_count integer not null default 0;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);

      await database.execute(sql`
        create table if not exists monthly_usage (
          id text primary key,
          user_id text not null references users(clerk_user_id) on delete cascade,
          usage_month text not null,
          export_count integer not null default 0,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
      await database.execute(sql`
        create unique index if not exists monthly_usage_user_month_unique
        on monthly_usage(user_id, usage_month)
      `);

      await database.execute(sql`
        create table if not exists plugins (
          id text primary key,
          owner_id text not null,
          name text not null,
          type text not null default 'synth',
          generation_status text not null default 'ready',
          generation_error text,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE plugins ADD COLUMN IF NOT EXISTS generation_status text;
          ALTER TABLE plugins ADD COLUMN IF NOT EXISTS generation_error text;
          ALTER TABLE plugins ALTER COLUMN generation_status SET DEFAULT 'ready';
          UPDATE plugins SET generation_status = 'ready' WHERE generation_status IS NULL;
          ALTER TABLE plugins ALTER COLUMN generation_status SET NOT NULL;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);

      await database.execute(sql`
        create table if not exists plugin_versions (
          id text primary key,
          plugin_id text not null references plugins(id) on delete cascade,
          version_number integer not null,
          prompt text not null,
          faust_code text not null,
          params_json text not null,
          spec_json jsonb,
          template_id text,
          tone_model text,
          quality_profile text,
          stereo_profile text,
          macro_json jsonb,
          ui_spec_json jsonb,
          eval_metrics_json jsonb,
          quality_labels_json jsonb,
          compile_errors_json jsonb,
          artifact_manifest_json jsonb,
          created_at bigint not null
        )
      `);
      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS spec_json jsonb;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS template_id text;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS tone_model text;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS quality_profile text;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS stereo_profile text;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS macro_json jsonb;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS ui_spec_json jsonb;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS eval_metrics_json jsonb;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS quality_labels_json jsonb;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS compile_errors_json jsonb;
          ALTER TABLE plugin_versions ADD COLUMN IF NOT EXISTS artifact_manifest_json jsonb;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);
      await database.execute(sql`
        create unique index if not exists plugin_versions_plugin_number_unique
        on plugin_versions(plugin_id, version_number)
      `);

      await database.execute(sql`
        create table if not exists plugin_messages (
          id text primary key,
          plugin_id text not null references plugins(id) on delete cascade,
          role text not null,
          content text not null,
          version_id text references plugin_versions(id) on delete cascade,
          created_at bigint not null
        )
      `);
      await database.execute(sql`
        create index if not exists plugin_messages_plugin_id_idx
        on plugin_messages(plugin_id)
      `);

      await database.execute(sql`
        create table if not exists builds (
          id text primary key,
          plugin_id text not null references plugins(id) on delete cascade,
          version_id text not null references plugin_versions(id) on delete cascade,
          owner_id text not null,
          format text not null,
          target text not null default 'vst3-linux-x64',
          workflow_id text,
          status text not null,
          stage text not null,
          status_message text,
          filename text,
          download_url text,
          error_message text,
          started_at bigint,
          completed_at bigint,
          metadata_json jsonb,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS workflow_id text;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS status text;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS stage text;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS target text;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS status_message text;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS filename text;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS download_url text;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS error_message text;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS started_at bigint;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS completed_at bigint;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS metadata_json jsonb;
          ALTER TABLE builds ALTER COLUMN target SET DEFAULT 'vst3-linux-x64';
          UPDATE builds SET target = CASE
            WHEN format = 'clap' THEN 'clap-linux-x64'
            ELSE 'vst3-linux-x64'
          END
          WHERE target IS NULL;
          ALTER TABLE builds ALTER COLUMN target SET NOT NULL;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS created_at bigint;
          ALTER TABLE builds ADD COLUMN IF NOT EXISTS updated_at bigint;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);
      await database.execute(sql`
        create index if not exists builds_owner_updated_idx
        on builds(owner_id, updated_at desc)
      `);
      await database.execute(sql`
        create index if not exists builds_plugin_version_format_idx
        on builds(plugin_id, version_id, format, updated_at desc)
      `);

      await database.execute(sql`
        create table if not exists build_logs (
          id text primary key,
          build_id text not null references builds(id) on delete cascade,
          level text not null,
          stage text not null,
          source text,
          message text not null,
          created_at bigint not null
        )
      `);
      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE build_logs ADD COLUMN IF NOT EXISTS level text;
          ALTER TABLE build_logs ADD COLUMN IF NOT EXISTS stage text;
          ALTER TABLE build_logs ADD COLUMN IF NOT EXISTS source text;
          ALTER TABLE build_logs ADD COLUMN IF NOT EXISTS message text;
          ALTER TABLE build_logs ADD COLUMN IF NOT EXISTS created_at bigint;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);
      await database.execute(sql`
        create index if not exists build_logs_build_created_idx
        on build_logs(build_id, created_at asc)
      `);

      await database.execute(sql`
        create table if not exists support_threads (
          id text primary key,
          clerk_user_id text not null references users(clerk_user_id) on delete cascade,
          discord_user_id text not null,
          owner_discord_user_id text not null,
          discord_channel_id text,
          title text not null,
          status text not null,
          blocked_at bigint,
          blocked_reason text,
          context_summary text,
          context_json jsonb,
          last_discord_message_id text,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS discord_user_id text;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS owner_discord_user_id text;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS discord_channel_id text;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS title text;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS status text;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS blocked_at bigint;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS blocked_reason text;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS context_summary text;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS context_json jsonb;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS last_discord_message_id text;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS created_at bigint;
          ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS updated_at bigint;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);
      await database.execute(sql`
        create index if not exists support_threads_user_updated_idx
        on support_threads(clerk_user_id, updated_at desc)
      `);

      await database.execute(sql`
        create table if not exists support_messages (
          id text primary key,
          thread_id text not null references support_threads(id) on delete cascade,
          author_role text not null,
          content text not null,
          source text not null,
          discord_message_id text,
          metadata_json jsonb,
          created_at bigint not null
        )
      `);
      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS author_role text;
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS content text;
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS source text;
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS discord_message_id text;
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS metadata_json jsonb;
          ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS created_at bigint;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);
      await database.execute(sql`
        create index if not exists support_messages_thread_created_idx
        on support_messages(thread_id, created_at asc)
      `);

      await database.execute(sql`
        create table if not exists user_discord_onboarding (
          clerk_user_id text primary key references users(clerk_user_id) on delete cascade,
          discord_user_id text not null,
          joined_role_assigned_at bigint,
          terms_accepted_at bigint,
          privacy_accepted_at bigint,
          terms_role_assigned_at bigint,
          privacy_role_assigned_at bigint,
          verified_role_assigned_at bigint,
          support_dm_sent_at bigint,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS discord_user_id text;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS joined_role_assigned_at bigint;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS terms_accepted_at bigint;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS privacy_accepted_at bigint;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS terms_role_assigned_at bigint;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS privacy_role_assigned_at bigint;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS verified_role_assigned_at bigint;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS support_dm_sent_at bigint;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS created_at bigint;
          ALTER TABLE user_discord_onboarding ADD COLUMN IF NOT EXISTS updated_at bigint;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);
      await database.execute(sql`
        create index if not exists user_discord_onboarding_discord_idx
        on user_discord_onboarding(discord_user_id)
      `);
    })();
  }

  try {
    await initialized;
  } catch (error) {
    initialized = null;
    console.error('[Hayashi] Database schema initialization failed:', error);
    throw error;
  }
}
