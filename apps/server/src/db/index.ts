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

      await database.execute(sql`
        create table if not exists users (
          discord_user_id text primary key,
          discord_username text not null,
          discord_global_name text,
          discord_avatar text,
          discord_email text,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);

      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE billing_customers DROP COLUMN IF EXISTS stripe_customer_id;
          ALTER TABLE billing_customers DROP COLUMN IF EXISTS stripe_subscription_id;
          ALTER TABLE billing_customers DROP COLUMN IF EXISTS stripe_price_id;
          ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS discord_entitlement_sku_id text;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);

      await database.execute(sql`
        create table if not exists billing_customers (
          user_id text primary key references users(discord_user_id) on delete cascade,
          plan text not null,
          subscription_status text not null,
          current_period_end bigint,
          discord_entitlement_sku_id text,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);

      await database.execute(sql`
        create table if not exists installations (
          id text primary key,
          user_id text not null references users(discord_user_id) on delete cascade,
          context_type text not null,
          context_id text not null,
          active boolean not null default true,
          first_installed_at bigint not null,
          last_seen_at bigint not null
        )
      `);
      await database.execute(sql`
        create unique index if not exists installations_user_context_unique
        on installations(user_id, context_type, context_id)
      `);

      await database.execute(sql`
        create table if not exists daily_usage (
          id text primary key,
          user_id text not null references users(discord_user_id) on delete cascade,
          usage_date text not null,
          export_count integer not null default 0,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
      await database.execute(sql`
        create unique index if not exists daily_usage_user_date_unique
        on daily_usage(user_id, usage_date)
      `);

      await database.execute(sql`drop table if exists checkout_sessions`);
      await database.execute(sql`drop table if exists billing_events`);

      await database.execute(sql`
        create table if not exists projects (
          id text primary key,
          owner_id text not null,
          channel_id text,
          title text not null,
          snapshot_json text not null,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
      await database.execute(sql`
        DO $$
        BEGIN
          ALTER TABLE projects ADD COLUMN IF NOT EXISTS channel_id text;
        EXCEPTION WHEN OTHERS THEN
          -- no-op on missing table or duplicate column
        END $$;
      `);

      await database.execute(sql`
        create table if not exists yjs_updates (
          id bigserial primary key,
          doc_name text not null,
          update_data text not null,
          created_at bigint not null
        )
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
