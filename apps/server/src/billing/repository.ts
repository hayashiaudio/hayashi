import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  billingCustomers,
  billingEvents,
  checkoutSessions,
  dailyUsage,
  installations,
  users,
} from '../db/schema.js';
import { ensureDbSchema, getDb, hasDatabaseUrl } from '../db/index.js';
import type { BillingEventRecord, BillingStoreData, BillingUserRecord, CheckoutSessionRecord } from './types.js';

export interface BillingRepository {
  getUser(discordUserId: string): Promise<BillingUserRecord | null>;
  saveUser(user: BillingUserRecord): Promise<BillingUserRecord>;
  findByStripeCustomerId(customerId: string): Promise<BillingUserRecord | null>;
  findByStripeSubscriptionId(subscriptionId: string): Promise<BillingUserRecord | null>;
  recordCheckoutSession(session: CheckoutSessionRecord): Promise<void>;
  recordBillingEvent(event: BillingEventRecord): Promise<'created' | 'updated' | 'unchanged'>;
  getBillingEvent(stripeEventId: string): Promise<BillingEventRecord | null>;
}

const DEFAULT_DATA: BillingStoreData = { users: {} };

export class FileBillingRepository implements BillingRepository {
  constructor(private readonly filePath = resolve(process.env.BILLING_STORE_PATH ?? '/tmp/hayashi/billing/store.json')) {}

  async getUser(discordUserId: string): Promise<BillingUserRecord | null> {
    const data = this.read();
    return data.users[discordUserId] ?? null;
  }

  async saveUser(user: BillingUserRecord): Promise<BillingUserRecord> {
    const data = this.read();
    data.users[user.discordUserId] = user;
    this.write(data);
    return user;
  }

  async findByStripeCustomerId(customerId: string): Promise<BillingUserRecord | null> {
    const data = this.read();
    return Object.values(data.users).find((user) => user.stripeCustomerId === customerId) ?? null;
  }

  async findByStripeSubscriptionId(subscriptionId: string): Promise<BillingUserRecord | null> {
    const data = this.read();
    return Object.values(data.users).find((user) => user.stripeSubscriptionId === subscriptionId) ?? null;
  }

  async recordCheckoutSession(_session: CheckoutSessionRecord): Promise<void> {}

  async recordBillingEvent(_event: BillingEventRecord): Promise<'created' | 'updated' | 'unchanged'> {
    return 'unchanged';
  }

  async getBillingEvent(_stripeEventId: string): Promise<BillingEventRecord | null> {
    return null;
  }

  private read(): BillingStoreData {
    this.ensureDir();
    if (!existsSync(this.filePath)) return structuredClone(DEFAULT_DATA);
    try {
      const content = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(content) as BillingStoreData;
      return { users: parsed.users ?? {} };
    } catch {
      return structuredClone(DEFAULT_DATA);
    }
  }

  private write(data: BillingStoreData) {
    this.ensureDir();
    writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  private ensureDir() {
    mkdirSync(dirname(this.filePath), { recursive: true });
  }
}

export class DrizzleBillingRepository implements BillingRepository {
  async getUser(discordUserId: string): Promise<BillingUserRecord | null> {
    await ensureDbSchema();
    return getUserRecord(discordUserId);
  }

  async saveUser(user: BillingUserRecord): Promise<BillingUserRecord> {
    await ensureDbSchema();
    const database = getDb();
    const now = Date.now();
    const userRow = toUserRow(user);
    const customerRow = toCustomerRow(user, now);
    const usageRow = toUsageRow(user, now);

    await database.transaction(async (tx) => {
      await tx
        .insert(users)
        .values(userRow)
        .onConflictDoUpdate({
          target: users.discordUserId,
          set: userRow,
        });

      await tx
        .insert(billingCustomers)
        .values(customerRow)
        .onConflictDoUpdate({
          target: billingCustomers.userId,
          set: customerRow,
        });

      if (usageRow) {
        await tx
          .insert(dailyUsage)
          .values(usageRow)
          .onConflictDoUpdate({
            target: [dailyUsage.userId, dailyUsage.usageDate],
            set: {
              exportCount: usageRow.exportCount,
              updatedAt: usageRow.updatedAt,
            },
          });
      }

      await syncInstallations(tx, user);
    });

    return (await getUserRecord(user.discordUserId)) ?? user;
  }

  async findByStripeCustomerId(customerId: string): Promise<BillingUserRecord | null> {
    await ensureDbSchema();
    const row = await getDb()
      .select({ userId: billingCustomers.userId })
      .from(billingCustomers)
      .where(eq(billingCustomers.stripeCustomerId, customerId))
      .limit(1);

    if (!row[0]) return null;
    return getUserRecord(row[0].userId);
  }

  async findByStripeSubscriptionId(subscriptionId: string): Promise<BillingUserRecord | null> {
    await ensureDbSchema();
    const row = await getDb()
      .select({ userId: billingCustomers.userId })
      .from(billingCustomers)
      .where(eq(billingCustomers.stripeSubscriptionId, subscriptionId))
      .limit(1);

    if (!row[0]) return null;
    return getUserRecord(row[0].userId);
  }

  async recordCheckoutSession(session: CheckoutSessionRecord): Promise<void> {
    await ensureDbSchema();
    await getDb()
      .insert(checkoutSessions)
      .values({
        stripeCheckoutSessionId: session.stripeCheckoutSessionId,
        userId: session.userId,
        stripeCustomerId: session.stripeCustomerId,
        status: session.status,
        checkoutUrl: session.checkoutUrl,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
      .onConflictDoUpdate({
        target: checkoutSessions.stripeCheckoutSessionId,
        set: {
          userId: session.userId,
          stripeCustomerId: session.stripeCustomerId,
          status: session.status,
          checkoutUrl: session.checkoutUrl,
          updatedAt: session.updatedAt,
        },
      });
  }

  async recordBillingEvent(event: BillingEventRecord): Promise<'created' | 'updated' | 'unchanged'> {
    await ensureDbSchema();
    const existing = await this.getBillingEvent(event.stripeEventId);
    if (existing?.status === 'processed') {
      return 'unchanged';
    }

    await getDb()
      .insert(billingEvents)
      .values({
        stripeEventId: event.stripeEventId,
        eventType: event.eventType,
        customerId: event.customerId,
        subscriptionId: event.subscriptionId,
        payloadJson: event.payloadJson,
        status: event.status,
        processedAt: event.processedAt,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      })
      .onConflictDoUpdate({
        target: billingEvents.stripeEventId,
        set: {
          eventType: event.eventType,
          customerId: event.customerId,
          subscriptionId: event.subscriptionId,
          payloadJson: event.payloadJson,
          status: event.status,
          processedAt: event.processedAt,
          updatedAt: event.updatedAt,
        },
      });

    return existing ? 'updated' : 'created';
  }

  async getBillingEvent(stripeEventId: string): Promise<BillingEventRecord | null> {
    await ensureDbSchema();
    const rows = await getDb().select().from(billingEvents).where(eq(billingEvents.stripeEventId, stripeEventId)).limit(1);
    if (!rows[0]) return null;
    return {
      stripeEventId: rows[0].stripeEventId,
      eventType: rows[0].eventType,
      customerId: rows[0].customerId,
      subscriptionId: rows[0].subscriptionId,
      payloadJson: rows[0].payloadJson,
      status: rows[0].status,
      processedAt: rows[0].processedAt,
      createdAt: rows[0].createdAt,
      updatedAt: rows[0].updatedAt,
    };
  }
}

async function getUserRecord(discordUserId: string): Promise<BillingUserRecord | null> {
  const database = getDb();
  const [userRow] = await database.select().from(users).where(eq(users.discordUserId, discordUserId)).limit(1);
  if (!userRow) return null;

  const [customerRow] = await database
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, discordUserId))
    .limit(1);

  const installationRows = await database
    .select()
    .from(installations)
    .where(and(eq(installations.userId, discordUserId), eq(installations.active, true)));

  const [usageRow] = await database
    .select()
    .from(dailyUsage)
    .where(eq(dailyUsage.userId, discordUserId))
    .orderBy(desc(dailyUsage.usageDate))
    .limit(1);

  return {
    discordUserId: userRow.discordUserId,
    discordUsername: userRow.discordUsername,
    discordGlobalName: userRow.discordGlobalName,
    discordAvatar: userRow.discordAvatar,
    email: userRow.discordEmail,
    stripeCustomerId: customerRow?.stripeCustomerId ?? null,
    stripeSubscriptionId: customerRow?.stripeSubscriptionId ?? null,
    stripePriceId: customerRow?.stripePriceId ?? null,
    plan: (customerRow?.plan ?? 'free') as BillingUserRecord['plan'],
    subscriptionStatus: (customerRow?.subscriptionStatus ?? 'inactive') as BillingUserRecord['subscriptionStatus'],
    currentPeriodEnd: customerRow?.currentPeriodEnd ?? null,
    guildInstallationId: installationRows.find((row) => row.contextType === 'guild')?.contextId ?? null,
    dmInstallationId: installationRows.find((row) => row.contextType === 'dm')?.contextId ?? null,
    dailyExportDate: usageRow?.usageDate ?? null,
    dailyExportCount: usageRow?.exportCount ?? 0,
    createdAt: userRow.createdAt,
    updatedAt: Math.max(userRow.updatedAt, customerRow?.updatedAt ?? 0, usageRow?.updatedAt ?? 0),
  };
}

function toUserRow(user: BillingUserRecord) {
  return {
    discordUserId: user.discordUserId,
    discordUsername: user.discordUsername,
    discordGlobalName: user.discordGlobalName,
    discordAvatar: user.discordAvatar,
    discordEmail: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toCustomerRow(user: BillingUserRecord, now: number) {
  return {
    userId: user.discordUserId,
    stripeCustomerId: user.stripeCustomerId,
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripePriceId: user.stripePriceId,
    currentPeriodEnd: user.currentPeriodEnd,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || now,
  };
}

function toUsageRow(user: BillingUserRecord, now: number) {
  if (!user.dailyExportDate) return null;
  return {
    id: `${user.discordUserId}:${user.dailyExportDate}`,
    userId: user.discordUserId,
    usageDate: user.dailyExportDate,
    exportCount: user.dailyExportCount,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || now,
  };
}

async function syncInstallations(tx: any, user: BillingUserRecord) {
  const desired = [
    user.guildInstallationId ? { type: 'guild', id: user.guildInstallationId } : null,
    user.dmInstallationId ? { type: 'dm', id: user.dmInstallationId } : null,
  ].filter((value): value is { type: 'guild' | 'dm'; id: string } => Boolean(value));

  const desiredKeys = new Set(desired.map((value) => `${value.type}:${value.id}`));
  const existing = await tx.select().from(installations).where(eq(installations.userId, user.discordUserId));

  const desiredIds = desired.map((value) => value.id);
  if (desiredIds.length > 0) {
    await tx
      .update(installations)
      .set({ active: false })
      .where(
        and(
          eq(installations.userId, user.discordUserId),
          inArray(installations.contextType, desired.map((value) => value.type))
        )
      );
  }

  for (const value of desired) {
    const current = existing.find((row: typeof installations.$inferSelect) => row.contextType === value.type && row.contextId === value.id);
    const now = user.updatedAt || Date.now();
    await tx
      .insert(installations)
      .values({
        id: current?.id ?? randomUUID(),
        userId: user.discordUserId,
        contextType: value.type,
        contextId: value.id,
        active: true,
        firstInstalledAt: current?.firstInstalledAt ?? now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [installations.userId, installations.contextType, installations.contextId],
        set: {
          active: true,
          lastSeenAt: now,
        },
      });
  }

  const stale = existing.filter((row: typeof installations.$inferSelect) => !desiredKeys.has(`${row.contextType}:${row.contextId}`));
  if (stale.length > 0) {
    await tx
      .update(installations)
      .set({ active: false })
      .where(inArray(installations.id, stale.map((row: typeof installations.$inferSelect) => row.id)));
  }
}

let repository: BillingRepository | null = null;

export function getBillingRepository(): BillingRepository {
  if (!repository || (hasDatabaseUrl() && repository instanceof FileBillingRepository)) {
    repository = hasDatabaseUrl() ? new DrizzleBillingRepository() : new FileBillingRepository();
  }
  return repository;
}

export function setBillingRepository(next: BillingRepository | null) {
  repository = next;
}
