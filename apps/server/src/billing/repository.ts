import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { eq, desc, and } from 'drizzle-orm';
import {
  billingCustomers,
  dailyUsage,
  users,
} from '../db/schema.js';
import { ensureDbSchema, getDb, hasDatabaseUrl } from '../db/index.js';
import type { BillingStoreData, BillingUserRecord } from './types.js';

export interface BillingRepository {
  getUser(clerkUserId: string): Promise<BillingUserRecord | null>;
  saveUser(user: BillingUserRecord): Promise<BillingUserRecord>;
}

const DEFAULT_DATA: BillingStoreData = { users: {} };

export class FileBillingRepository implements BillingRepository {
  constructor(private readonly filePath = resolve(process.env.BILLING_STORE_PATH ?? '/tmp/hayashi/billing/store.json')) {}

  async getUser(clerkUserId: string): Promise<BillingUserRecord | null> {
    const data = this.read();
    return data.users[clerkUserId] ?? null;
  }

  async saveUser(user: BillingUserRecord): Promise<BillingUserRecord> {
    const data = this.read();
    data.users[user.clerkUserId] = user;
    this.write(data);
    return user;
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
  async getUser(clerkUserId: string): Promise<BillingUserRecord | null> {
    await ensureDbSchema();
    return getUserRecord(clerkUserId);
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
          target: users.clerkUserId,
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
    });

    return (await getUserRecord(user.clerkUserId)) ?? user;
  }
}

async function getUserRecord(clerkUserId: string): Promise<BillingUserRecord | null> {
  const database = getDb();
  const [userRow] = await database.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
  if (!userRow) return null;

  const [customerRow] = await database
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, clerkUserId))
    .limit(1);

  const [usageRow] = await database
    .select()
    .from(dailyUsage)
    .where(eq(dailyUsage.userId, clerkUserId))
    .orderBy(desc(dailyUsage.usageDate))
    .limit(1);

  return {
    clerkUserId: userRow.clerkUserId,
    name: userRow.name ?? null,
    email: userRow.email ?? null,
    stripeCustomerId: customerRow?.stripeCustomerId ?? null,
    stripeSubscriptionId: customerRow?.stripeSubscriptionId ?? null,
    stripePriceId: customerRow?.stripePriceId ?? null,
    plan: (customerRow?.plan ?? 'free') as BillingUserRecord['plan'],
    subscriptionStatus: (customerRow?.subscriptionStatus ?? 'inactive') as BillingUserRecord['subscriptionStatus'],
    currentPeriodEnd: customerRow?.currentPeriodEnd ?? null,
    dailyExportDate: usageRow?.usageDate ?? null,
    dailyExportCount: usageRow?.exportCount ?? 0,
    createdAt: userRow.createdAt,
    updatedAt: Math.max(userRow.updatedAt, customerRow?.updatedAt ?? 0, usageRow?.updatedAt ?? 0),
  };
}

function toUserRow(user: BillingUserRecord) {
  return {
    clerkUserId: user.clerkUserId,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toCustomerRow(user: BillingUserRecord, now: number) {
  return {
    userId: user.clerkUserId,
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    currentPeriodEnd: user.currentPeriodEnd,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripePriceId: user.stripePriceId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || now,
  };
}

function toUsageRow(user: BillingUserRecord, now: number) {
  if (!user.dailyExportDate) return null;
  return {
    id: `${user.clerkUserId}:${user.dailyExportDate}`,
    userId: user.clerkUserId,
    usageDate: user.dailyExportDate,
    exportCount: user.dailyExportCount,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || now,
  };
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
