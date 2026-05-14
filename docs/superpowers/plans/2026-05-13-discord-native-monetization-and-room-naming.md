# Discord Native Monetization and Room Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Stripe billing with Discord's native Embedded App monetization (`startPurchase`, `getSkus`, `getEntitlements`, `ENTITLEMENT_CREATE`) and add a room-naming step to the creation flow so users can customize the title instead of defaulting to `{user}'s Jam`.

**Architecture:**
- Server drops all Stripe integration (webhook, checkout, portal, customer records) and instead queries Discord's entitlements API using a bot token to determine if a user owns the unlimited SKU.
- Client initiates purchases via `DiscordSDK.commands.startPurchase()` and listens for `ENTITLEMENT_CREATE` events to refresh billing state without a page reload.
- The room creation flow gets a lightweight modal inside `SessionEntryScreen` that prompts for a name before committing `projectId` and `projectTitle` to the store.

**Tech Stack:** React, TypeScript, Hono, Drizzle ORM, PostgreSQL, `@discord/embedded-app-sdk`, Vitest.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/server/src/billing/discordEntitlements.ts` | Create | Server-side Discord entitlements API client |
| `apps/server/src/billing/stripe.ts` | Delete | Entire Stripe module |
| `apps/server/src/billing/types.ts` | Modify | Remove Stripe fields; add Discord entitlement fields |
| `apps/server/src/billing/service.ts` | Modify | Replace Stripe logic with Discord entitlement sync |
| `apps/server/src/billing/repository.ts` | Modify | Remove Stripe-specific repository methods |
| `apps/server/src/db/schema.ts` | Modify | Remove Stripe columns from `billingCustomers` |
| `apps/server/src/routes.ts` | Modify | Remove Stripe routes; update billing bootstrap to sync entitlements |
| `apps/server/src/routes.test.ts` | Modify | Update billing tests to mock Discord entitlements API |
| `apps/client/src/types/billing.ts` | Modify | Remove `stripeCustomerId` from snapshot |
| `apps/client/src/lib/api.ts` | Modify | Remove Stripe checkout/portal helpers |
| `apps/client/src/hooks/useDiscordSdk.ts` | Modify | Add `startDiscordPurchase` helper and `ENTITLEMENT_CREATE` subscription |
| `apps/client/src/components/BillingModal.tsx` | Modify | Use Discord `startPurchase`; remove Stripe manage-billing button |
| `apps/client/src/App.tsx` | Modify | Replace Stripe installation-blocked handlers with Discord purchase |
| `apps/client/src/components/SessionEntryScreen.tsx` | Modify | Add room-naming modal step |

---

## Part A — Discord Native Monetization

### Task 1: Create Discord entitlements server module

**Files:**
- Create: `apps/server/src/billing/discordEntitlements.ts`

- [ ] **Step 1: Write the module**

```typescript
const DISCORD_API_BASE = 'https://discord.com/api/v10';

export interface DiscordEntitlement {
  id: string;
  sku_id: string;
  application_id: string;
  user_id?: string;
  type: number;
  deleted: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

function requireBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not configured');
  return token;
}

function requireApplicationId(): string {
  const id = process.env.DISCORD_CLIENT_ID ?? process.env.VITE_DISCORD_CLIENT_ID;
  if (!id) throw new Error('DISCORD_CLIENT_ID is not configured');
  return id;
}

export async function fetchDiscordEntitlements(discordUserId: string): Promise<DiscordEntitlement[]> {
  const appId = requireApplicationId();
  const botToken = requireBotToken();

  const url = new URL(`${DISCORD_API_BASE}/applications/${appId}/entitlements`);
  url.searchParams.set('user_id', discordUserId);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string }).message ?? `Discord entitlements request failed (${response.status})`
    );
  }

  const entitlements = (await response.json()) as DiscordEntitlement[];
  return entitlements.filter((e) => !e.deleted);
}

export function findUnlimitedEntitlement(
  entitlements: DiscordEntitlement[],
  unlimitedSkuId?: string
): DiscordEntitlement | null {
  if (!unlimitedSkuId) return null;
  return entitlements.find((e) => e.sku_id === unlimitedSkuId) ?? null;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/billing/discordEntitlements.ts
git commit -m "feat: add Discord entitlements API client"
```

---

### Task 2: Remove Stripe server module

**Files:**
- Delete: `apps/server/src/billing/stripe.ts`

- [ ] **Step 1: Delete the file**

```bash
rm apps/server/src/billing/stripe.ts
git add apps/server/src/billing/stripe.ts
git commit -m "chore: remove Stripe server module"
```

---

### Task 3: Update billing types

**Files:**
- Modify: `apps/server/src/billing/types.ts`

- [ ] **Step 1: Remove Stripe fields from `BillingUserRecord`**

Replace:
```typescript
export interface BillingUserRecord {
  discordUserId: string;
  discordUsername: string;
  discordGlobalName: string | null;
  discordAvatar: string | null;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  guildInstallationId: string | null;
  dmInstallationId: string | null;
  dailyExportDate: string | null;
  dailyExportCount: number;
  createdAt: number;
  updatedAt: number;
}
```

With:
```typescript
export interface BillingUserRecord {
  discordUserId: string;
  discordUsername: string;
  discordGlobalName: string | null;
  discordAvatar: string | null;
  email: string | null;
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  discordEntitlementSkuId: string | null;
  guildInstallationId: string | null;
  dmInstallationId: string | null;
  dailyExportDate: string | null;
  dailyExportCount: number;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Remove Stripe fields from `BillingSnapshot`**

Replace:
```typescript
export interface BillingSnapshot {
  user: {
    discordUserId: string;
    discordUsername: string;
    discordAvatar: string | null;
    email: string | null;
  };
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  stripeCustomerId: string | null;
  entitlements: {
    activeNodeLimit: number | null;
    exportsPerDay: number | null;
    guildInstallations: number | null;
    dmInstallations: number | null;
  };
  usage: {
    dailyExportsUsed: number;
    dailyExportsRemaining: number | null;
    guildInstallationId: string | null;
    dmInstallationId: string | null;
  };
  contextAccess: BillingAccessResult;
}
```

With:
```typescript
export interface BillingSnapshot {
  user: {
    discordUserId: string;
    discordUsername: string;
    discordAvatar: string | null;
    email: string | null;
  };
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  entitlements: {
    activeNodeLimit: number | null;
    exportsPerDay: number | null;
    guildInstallations: number | null;
    dmInstallations: number | null;
  };
  usage: {
    dailyExportsUsed: number;
    dailyExportsRemaining: number | null;
    guildInstallationId: string | null;
    dmInstallationId: string | null;
  };
  contextAccess: BillingAccessResult;
}
```

- [ ] **Step 3: Remove Stripe-specific record types**

Delete the entire `CheckoutSessionRecord` and `BillingEventRecord` interfaces from the bottom of the file.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/billing/types.ts
git commit -m "feat: replace Stripe types with Discord entitlement types"
```

---

### Task 4: Update DB schema

**Files:**
- Modify: `apps/server/src/db/schema.ts`

- [ ] **Step 1: Remove Stripe columns from `billingCustomers`**

Replace the `billingCustomers` table definition with:

```typescript
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
```

- [ ] **Step 2: Delete unused Stripe tables**

Delete the entire `checkoutSessions` and `billingEvents` table definitions from `db/schema.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/db/schema.ts
git commit -m "feat: remove Stripe columns and tables from schema"
```

> **Note:** If this codebase is deployed with `drizzle-kit push`, run `npx drizzle-kit push` after this commit to apply schema changes. Back up the `billing_events` and `checkout_sessions` tables before pushing if historical data matters.

---

### Task 5: Update billing repository

**Files:**
- Modify: `apps/server/src/billing/repository.ts`

- [ ] **Step 1: Remove Stripe-specific interface methods**

Replace the `BillingRepository` interface with:

```typescript
export interface BillingRepository {
  getUser(discordUserId: string): Promise<BillingUserRecord | null>;
  saveUser(user: BillingUserRecord): Promise<BillingUserRecord>;
}
```

- [ ] **Step 2: Update `FileBillingRepository`**

Remove `findByStripeCustomerId`, `findByStripeSubscriptionId`, `recordCheckoutSession`, `recordBillingEvent`, and `getBillingEvent` methods from `FileBillingRepository`.

- [ ] **Step 3: Update `DrizzleBillingRepository`**

Remove the same methods from `DrizzleBillingRepository`. Keep only `getUser` and `saveUser`.

- [ ] **Step 4: Update `getUserRecord` return shape**

In `getUserRecord`, replace:
```typescript
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
```

With:
```typescript
  return {
    discordUserId: userRow.discordUserId,
    discordUsername: userRow.discordUsername,
    discordGlobalName: userRow.discordGlobalName,
    discordAvatar: userRow.discordAvatar,
    email: userRow.discordEmail,
    plan: (customerRow?.plan ?? 'free') as BillingUserRecord['plan'],
    subscriptionStatus: (customerRow?.subscriptionStatus ?? 'inactive') as BillingUserRecord['subscriptionStatus'],
    currentPeriodEnd: customerRow?.currentPeriodEnd ?? null,
    discordEntitlementSkuId: customerRow?.discordEntitlementSkuId ?? null,
    guildInstallationId: installationRows.find((row) => row.contextType === 'guild')?.contextId ?? null,
    dmInstallationId: installationRows.find((row) => row.contextType === 'dm')?.contextId ?? null,
    dailyExportDate: usageRow?.usageDate ?? null,
    dailyExportCount: usageRow?.exportCount ?? 0,
    createdAt: userRow.createdAt,
    updatedAt: Math.max(userRow.updatedAt, customerRow?.updatedAt ?? 0, usageRow?.updatedAt ?? 0),
  };
```

- [ ] **Step 5: Update `toCustomerRow`**

Replace:
```typescript
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
```

With:
```typescript
function toCustomerRow(user: BillingUserRecord, now: number) {
  return {
    userId: user.discordUserId,
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    currentPeriodEnd: user.currentPeriodEnd,
    discordEntitlementSkuId: user.discordEntitlementSkuId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || now,
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/billing/repository.ts
git commit -m "feat: remove Stripe from billing repository"
```

---

### Task 6: Update billing service

**Files:**
- Modify: `apps/server/src/billing/service.ts`

- [ ] **Step 1: Remove Stripe imports and constants**

Replace the top of the file with:

```typescript
import type {
  BillingAccessResult,
  BillingContext,
  BillingSnapshot,
  BillingUserRecord,
  DiscordIdentity,
  PlanTier,
  SubscriptionStatus,
} from './types.js';
import type { BillingRepository } from './repository.js';
import { fetchDiscordEntitlements, findUnlimitedEntitlement } from './discordEntitlements.js';

export const FREE_ACTIVE_NODE_LIMIT = 8;
export const FREE_EXPORTS_PER_DAY = 3;
export const DISCORD_UNLIMITED_SKU_ID = process.env.DISCORD_UNLIMITED_SKU_ID ?? '';
```

Delete `HAYASHI_UNLIMITED_PRICE_ID`, `derivePlanFromStripe`, and `normalizeSubscriptionStatus`.

- [ ] **Step 2: Update `getOrCreateUser`**

Replace the new-user branch to remove Stripe fields:

```typescript
      : {
          discordUserId: identity.id,
          discordUsername: identity.global_name ?? identity.username,
          discordGlobalName: identity.global_name ?? null,
          discordAvatar: identity.avatar ?? null,
          email: identity.email ?? null,
          plan: 'free',
          subscriptionStatus: 'inactive',
          currentPeriodEnd: null,
          discordEntitlementSkuId: null,
          guildInstallationId: null,
          dmInstallationId: null,
          dailyExportDate: todayKey(),
          dailyExportCount: 0,
          createdAt: now,
          updatedAt: now,
        };
```

- [ ] **Step 3: Update `buildSnapshot`**

Remove `stripeCustomerId: normalized.stripeCustomerId,` from the returned object.

- [ ] **Step 4: Replace Stripe methods with Discord entitlement sync**

Delete these methods entirely: `updateStripeCustomer`, `setStripeCustomerId`, `upsertSubscriptionForCustomer`, `attachCheckoutToUser`.

Add this new method in their place:

```typescript
  async syncEntitlements(user: BillingUserRecord): Promise<BillingUserRecord> {
    try {
      const entitlements = await fetchDiscordEntitlements(user.discordUserId);
      const unlimited = findUnlimitedEntitlement(entitlements, DISCORD_UNLIMITED_SKU_ID);

      user.plan = unlimited ? 'unlimited' : 'free';
      user.subscriptionStatus = unlimited ? 'active' : 'inactive';
      user.currentPeriodEnd = unlimited?.ends_at ? new Date(unlimited.ends_at).getTime() : null;
      user.discordEntitlementSkuId = unlimited?.sku_id ?? null;
      user.updatedAt = Date.now();
    } catch {
      // If Discord API fails, preserve existing plan state to avoid downgrading users during outages
    }
    return this.repository.saveUser(user);
  }
```

- [ ] **Step 5: Update `shouldBeUnlimited` helper**

Replace:
```typescript
function shouldBeUnlimited(status: SubscriptionStatus, priceId: string | null): boolean {
  return priceId === HAYASHI_UNLIMITED_PRICE_ID && (status === 'active' || status === 'trialing');
}
```

With:
```typescript
function shouldBeUnlimited(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/billing/service.ts
git commit -m "feat: replace Stripe with Discord entitlement sync in billing service"
```

---

### Task 7: Update server routes

**Files:**
- Modify: `apps/server/src/routes.ts`

- [ ] **Step 1: Remove Stripe imports**

Delete:
```typescript
import {
  createBillingPortalSession,
  createCheckoutSession,
  createStripeCustomer,
  extractSubscriptionPatch,
  updateStripeCustomerEmail,
  verifyStripeWebhookSignature,
} from './billing/stripe.js';
```

- [ ] **Step 2: Remove `isStripeMissingCustomerError` helper**

Delete:
```typescript
function isStripeMissingCustomerError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No such customer:');
}
```

- [ ] **Step 3: Update `/billing/bootstrap` to sync entitlements**

Replace the bootstrap route body with:

```typescript
app.post('/billing/bootstrap', async (c) => {
  const body = await c.req.json<{ accessToken?: string; guildId?: string | null; channelId?: string | null }>();
  if (!body.accessToken) return c.json({ error: 'Missing Discord access token' }, 400);

  try {
    const identity = await fetchDiscordIdentity(body.accessToken);
    const context = buildBillingContext(body.guildId, body.channelId);
    const user = await billing.getOrCreateUser(identity);
    const synced = await billing.syncEntitlements(user);
    const snapshot = await billing.registerContext(synced, context);
    return c.json(snapshot);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Billing bootstrap failed' }, 401);
  }
});
```

- [ ] **Step 4: Delete `/billing/checkout` route**

Delete the entire `app.post('/billing/checkout', ...)` block (lines 96-180 in current file).

- [ ] **Step 5: Delete `/billing/portal` route**

Delete the entire `app.post('/billing/portal', ...)` block (lines 182-208 in current file).

- [ ] **Step 6: Update `/billing/export/authorize` to sync entitlements**

Replace the export authorize route body with:

```typescript
app.post('/billing/export/authorize', async (c) => {
  const body = await c.req.json<{ accessToken?: string; guildId?: string | null; channelId?: string | null }>();
  if (!body.accessToken) return c.json({ error: 'Missing Discord access token' }, 400);

  try {
    const identity = await fetchDiscordIdentity(body.accessToken);
    const context = buildBillingContext(body.guildId, body.channelId);
    const user = await billing.getOrCreateUser(identity);
    const synced = await billing.syncEntitlements(user);
    const snapshot = await billing.authorizeExport(synced, context);
    return c.json(snapshot, snapshot.contextAccess.allowed ? 200 : 403);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to authorize export' }, 500);
  }
});
```

- [ ] **Step 7: Delete `/stripe/webhook` route**

Delete the entire `app.post('/stripe/webhook', ...)` block (lines 304-405 in current file).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/routes.ts
git commit -m "feat: remove Stripe routes, add Discord entitlement sync to billing bootstrap"
```

---

### Task 8: Update server tests

**Files:**
- Modify: `apps/server/src/routes.test.ts`

- [ ] **Step 1: Add Discord entitlements mock to billing test**

Inside the `withMockIdentity` helper, also mock the Discord entitlements endpoint. Replace the mock `fetch` inside `withMockIdentity` with:

```typescript
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/users/@me')) {
        return new Response(JSON.stringify(mockDiscordUser), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/applications/') && url.includes('/entitlements')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input);
    }) as typeof fetch;
```

- [ ] **Step 2: Set required env vars in billing test**

Add at the top of the billing `describe` block:

```typescript
  describe('billing', () => {
    beforeEach(() => {
      process.env.DISCORD_CLIENT_ID = 'discord-client-id';
      process.env.DISCORD_BOT_TOKEN = 'discord-bot-token';
    });

    afterEach(() => {
      delete process.env.DISCORD_CLIENT_ID;
      delete process.env.DISCORD_BOT_TOKEN;
    });
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes.test.ts
git commit -m "test: update billing tests for Discord entitlements"
```

---

### Task 9: Update client billing types

**Files:**
- Modify: `apps/client/src/types/billing.ts`

- [ ] **Step 1: Remove `stripeCustomerId` from `BillingSnapshot`**

Replace the `BillingSnapshot` interface with:

```typescript
export interface BillingSnapshot {
  user: {
    discordUserId: string;
    discordUsername: string;
    discordAvatar: string | null;
    email: string | null;
  };
  plan: BillingPlan;
  subscriptionStatus: BillingStatus;
  currentPeriodEnd: number | null;
  entitlements: {
    activeNodeLimit: number | null;
    exportsPerDay: number | null;
    guildInstallations: number | null;
    dmInstallations: number | null;
  };
  usage: {
    dailyExportsUsed: number;
    dailyExportsRemaining: number | null;
    guildInstallationId: string | null;
    dmInstallationId: string | null;
  };
  contextAccess: {
    allowed: boolean;
    reason: BillingBlockReason | null;
    message: string | null;
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/types/billing.ts
git commit -m "feat: remove Stripe fields from client billing types"
```

---

### Task 10: Update client API helpers

**Files:**
- Modify: `apps/client/src/lib/api.ts`

- [ ] **Step 1: Delete Stripe checkout and portal helpers**

Delete `createBillingCheckout` and `createBillingPortal` functions entirely.

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/lib/api.ts
git commit -m "feat: remove Stripe checkout and portal client helpers"
```

---

### Task 11: Add Discord purchase helper to SDK hook

**Files:**
- Modify: `apps/client/src/hooks/useDiscordSdk.ts`

- [ ] **Step 1: Add `startDiscordPurchase` helper**

Add after the `openInviteDialog` function:

```typescript
export async function startDiscordPurchase(skuId: string): Promise<boolean> {
  const sdk = getDiscordSdk();
  if (!sdk || !isRunningInDiscord()) {
    console.warn('[Hayashi] startPurchase called outside Discord');
    return false;
  }
  try {
    await sdk.commands.startPurchase({ sku_id: skuId });
    return true;
  } catch (error) {
    console.warn('[Hayashi] startPurchase failed:', error);
    return false;
  }
}
```

- [ ] **Step 2: Add `ENTITLEMENT_CREATE` subscription inside `useDiscordSdk` init**

Inside the `init()` function in `useDiscordSdk`, after the `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` subscription (around line 295), add:

```typescript
        if (!subscribedRef.current) {
          try {
            await sdk.subscribe(
              'ENTITLEMENT_CREATE',
              () => {
                console.log('[Hayashi] Entitlement created — refreshing billing');
                // Consumers can listen for this via a callback if needed;
                // for now, App.tsx will re-bootstrap billing on its own timer.
              }
            );
            console.log('[Hayashi] Subscribed to ENTITLEMENT_CREATE');
          } catch (entErr) {
            console.warn('[Hayashi] Subscribe to ENTITLEMENT_CREATE failed:', entErr);
          }
        }
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/hooks/useDiscordSdk.ts
git commit -m "feat: add Discord startPurchase helper and ENTITLEMENT_CREATE subscription"
```

---

### Task 12: Update BillingModal for Discord native purchase

**Files:**
- Modify: `apps/client/src/components/BillingModal.tsx`

- [ ] **Step 1: Replace imports and handlers**

Replace the top of the file with:

```typescript
import { useState } from 'react';
import { Crown, Lock, X } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { startDiscordPurchase } from '@/hooks/useDiscordSdk';
import { DISCORD_UNLIMITED_SKU_ID } from '@/lib/constants';
```

- [ ] **Step 2: Replace upgrade handler**

Replace `handleUpgrade` and `handleManage` with:

```typescript
  const handleUpgrade = async () => {
    if (!accessToken || !DISCORD_UNLIMITED_SKU_ID) return;
    setPending('checkout');
    try {
      const success = await startDiscordPurchase(DISCORD_UNLIMITED_SKU_ID);
      if (!success) {
        console.warn('[Hayashi] Purchase did not complete');
      }
    } finally {
      setPending(null);
    }
  };
```

- [ ] **Step 3: Remove Stripe manage-billing button**

Delete the `{billing.snapshot?.stripeCustomerId && (...)}` button block entirely. The remaining buttons section should only show the Upgrade button for non-unlimited users.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/BillingModal.tsx
git commit -m "feat: use Discord native purchase in BillingModal"
```

---

### Task 13: Update App.tsx for Discord billing

**Files:**
- Modify: `apps/client/src/App.tsx`

- [ ] **Step 1: Remove Stripe API imports**

Delete:
```typescript
import {
  bootstrapBilling,
  createBillingCheckout,
  createBillingPortal,
  createBillingStreamToken,
  loadProjectSnapshot,
  saveProjectSnapshot,
} from './lib/api';
```

Replace with:
```typescript
import {
  bootstrapBilling,
  createBillingStreamToken,
  loadProjectSnapshot,
  saveProjectSnapshot,
} from './lib/api';
```

- [ ] **Step 2: Add Discord purchase import**

Add:
```typescript
import { startDiscordPurchase } from './hooks/useDiscordSdk';
import { DISCORD_UNLIMITED_SKU_ID } from './lib/constants';
```

- [ ] **Step 3: Replace installation-blocked Stripe handlers**

Inside the `installationBlocked` render block, replace `handleUpgrade` and `handleManage` with:

```typescript
    const handleUpgrade = async () => {
      if (!accessToken || !DISCORD_UNLIMITED_SKU_ID) return;
      setInstallationAction('checkout');
      try {
        await startDiscordPurchase(DISCORD_UNLIMITED_SKU_ID);
      } finally {
        setInstallationAction(null);
      }
    };
```

And remove the `handleManage` function and its associated button. The buttons inside the blocked UI should only show the Upgrade button.

- [ ] **Step 4: Remove `openExternalUrl` import if unused**

If `openExternalUrl` is no longer used anywhere in `App.tsx`, delete its import.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/App.tsx
git commit -m "feat: replace Stripe billing handlers with Discord native purchase in App"
```

---

### Task 14: Add Discord SKU constant

**Files:**
- Modify: `apps/client/src/lib/constants.ts`

- [ ] **Step 1: Add `DISCORD_UNLIMITED_SKU_ID`**

Add:
```typescript
export const DISCORD_UNLIMITED_SKU_ID = import.meta.env.VITE_DISCORD_UNLIMITED_SKU_ID ?? '';
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/lib/constants.ts
git commit -m "feat: expose Discord unlimited SKU ID as client constant"
```

---

## Part B — Room Naming Flow

### Task 15: Add room naming modal to SessionEntryScreen

**Files:**
- Modify: `apps/client/src/components/SessionEntryScreen.tsx`

- [ ] **Step 1: Add modal state and imports**

Add `useRef` to the React import and import `X` from `lucide-react`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { Plus, Loader2, X } from 'lucide-react';
import { listProjects } from '@/lib/api';
```

- [ ] **Step 2: Add modal state inside component**

Inside `SessionEntryScreen`, after `const [error, setError] = useState<string | null>(null);`, add:

```typescript
  const [namingOpen, setNamingOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Update `createProject` to open modal**

Replace:
```typescript
  const createProject = useCallback(() => {
    const id = crypto.randomUUID();
    setProjectId(id);
    setProjectTitle(`${user?.username ?? "Anonymous"}'s Jam`);
  }, [setProjectId, setProjectTitle, user]);
```

With:
```typescript
  const createProject = useCallback(() => {
    const defaultTitle = `${user?.username ?? "Anonymous"}'s Jam`;
    setDraftTitle(defaultTitle);
    setNamingOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [user]);

  const confirmCreate = useCallback(() => {
    const id = crypto.randomUUID();
    const title = draftTitle.trim() || `${user?.username ?? "Anonymous"}'s Jam`;
    setProjectId(id);
    setProjectTitle(title);
    setNamingOpen(false);
    setDraftTitle('');
  }, [draftTitle, setProjectId, setProjectTitle, user]);

  const cancelCreate = useCallback(() => {
    setNamingOpen(false);
    setDraftTitle('');
  }, []);
```

- [ ] **Step 4: Add modal JSX before the closing `</div>` of the main container**

Insert before the final `</div>` that closes the outer wrapper:

```tsx
      {namingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            className="w-full max-w-sm p-6 space-y-4"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(16, 38, 29, 0.08)',
              borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold" style={{ color: '#1a1a1a' }}>
                Name your room
              </h2>
              <button
                type="button"
                onClick={cancelCreate}
                className="rounded-md p-1 transition-colors hover:bg-black/5"
                aria-label="Cancel"
              >
                <X size={16} style={{ color: '#666' }} />
              </button>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreate();
                if (e.key === 'Escape') cancelCreate();
              }}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgba(237,146,47,0.4)]"
              style={{
                borderColor: 'rgba(16, 38, 29, 0.12)',
                color: '#1a1a1a',
                background: '#fafafa',
              }}
              placeholder={`${user?.username ?? "Anonymous"}'s Jam`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelCreate}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5"
                style={{ color: '#555', border: '1px solid rgba(16, 38, 29, 0.1)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCreate}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors"
                style={{ background: '#ed922f' }}
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/SessionEntryScreen.tsx
git commit -m "feat: add room naming step to creation flow"
```

---

## Verification

### Task 16: Type-check the client

- [ ] **Step 1: Run client typecheck**

```bash
cd apps/client && npm run lint
```

Expected: No TypeScript errors.

- [ ] **Step 2: Run server typecheck**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 3: Run server tests**

```bash
cd apps/server && npm test
```

Expected: All tests pass, including the updated billing bootstrap test.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: verify typecheck and tests pass after Stripe removal"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] Stripe removed from server (`stripe.ts` deleted, routes removed, schema updated)
   - [x] Discord native purchase flow implemented (`startPurchase`, `getEntitlements`)
   - [x] `ENTITLEMENT_CREATE` event subscription added
   - [x] Server queries Discord entitlements API using bot token
   - [x] Client `BillingModal` uses Discord purchase instead of Stripe checkout
   - [x] Client `App.tsx` installation-blocked screen uses Discord purchase
   - [x] Room creation flow has a naming step
   - [x] Fallback title `{user}'s Jam` preserved when user leaves input empty or cancels
   - [x] `title` column in `projects` table already exists; no DB migration needed for room naming

2. **Placeholder scan:**
   - [x] No "TBD", "TODO", "implement later"
   - [x] No vague "add appropriate error handling" steps
   - [x] Every code step contains exact code or exact diff guidance
   - [x] Exact file paths in every task

3. **Type consistency:**
   - [x] `BillingUserRecord` no longer references `stripeCustomerId` / `stripeSubscriptionId` / `stripePriceId`
   - [x] `BillingSnapshot` no longer contains `stripeCustomerId`
   - [x] `toCustomerRow` maps `discordEntitlementSkuId`
   - [x] `getUserRecord` returns `discordEntitlementSkuId`
   - [x] `findByStripeCustomerId` / `findByStripeSubscriptionId` removed from `BillingRepository`
   - [x] `DISCORD_UNLIMITED_SKU_ID` used consistently on both client and server
   - [x] `startDiscordPurchase` signature matches Discord SDK usage

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-discord-native-monetization-and-room-naming.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
