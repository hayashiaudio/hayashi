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
        create table if not exists billing_customers (
          user_id text primary key references users(discord_user_id) on delete cascade,
          stripe_customer_id text unique,
          plan text not null,
          subscription_status text not null,
          stripe_subscription_id text,
          stripe_price_id text,
          current_period_end bigint,
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

      await database.execute(sql`
        create table if not exists checkout_sessions (
          stripe_checkout_session_id text primary key,
          user_id text not null references users(discord_user_id) on delete cascade,
          stripe_customer_id text,
          status text not null,
          checkout_url text,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);

      await database.execute(sql`
        create table if not exists billing_events (
          stripe_event_id text primary key,
          event_type text not null,
          customer_id text,
          subscription_id text,
          payload_json text not null,
          status text not null,
          processed_at bigint,
          created_at bigint not null,
          updated_at bigint not null
        )
      `);
    })();
  }

  await initialized;
}
