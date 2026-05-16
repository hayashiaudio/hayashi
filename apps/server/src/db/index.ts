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
      max: 1,
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
          created_at bigint not null,
          updated_at bigint not null
        )
      `);

      await database.execute(sql`
        create table if not exists plugin_versions (
          id text primary key,
          plugin_id text not null references plugins(id) on delete cascade,
          version_number integer not null,
          prompt text not null,
          faust_code text not null,
          params_json text not null,
          created_at bigint not null
        )
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
