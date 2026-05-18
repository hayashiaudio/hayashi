import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, ensureDbSchema } from '../db/index.js';
import { supportMessages, supportThreads } from '../db/schema.js';

export type SupportThreadStatus = 'open' | 'blocked' | 'closed';
export type SupportAuthorRole = 'customer' | 'support' | 'assistant' | 'system';
export type SupportMessageSource = 'web' | 'discord' | 'azure' | 'system';

export interface SupportThreadRecord {
  id: string;
  clerkUserId: string;
  discordUserId: string;
  ownerDiscordUserId: string;
  discordChannelId: string | null;
  title: string;
  status: SupportThreadStatus;
  blockedAt: number | null;
  blockedReason: string | null;
  contextSummary: string | null;
  contextJson: unknown | null;
  lastDiscordMessageId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SupportMessageRecord {
  id: string;
  threadId: string;
  authorRole: SupportAuthorRole;
  content: string;
  source: SupportMessageSource;
  discordMessageId: string | null;
  metadataJson: unknown | null;
  createdAt: number;
}

export interface SupportThreadWithMessages extends SupportThreadRecord {
  messages: SupportMessageRecord[];
}

export async function listSupportThreadsForUser(clerkUserId: string): Promise<SupportThreadRecord[]> {
  await ensureDbSchema();
  const db = getDb();
  return (await db
    .select()
    .from(supportThreads)
    .where(eq(supportThreads.clerkUserId, clerkUserId))
    .orderBy(desc(supportThreads.updatedAt))) as SupportThreadRecord[];
}

export async function listSupportThreadsForOwner(ownerDiscordUserId: string): Promise<SupportThreadRecord[]> {
  await ensureDbSchema();
  const db = getDb();
  return (await db
    .select()
    .from(supportThreads)
    .where(eq(supportThreads.ownerDiscordUserId, ownerDiscordUserId))
    .orderBy(desc(supportThreads.updatedAt))) as SupportThreadRecord[];
}

export async function getSupportThread(threadId: string): Promise<SupportThreadWithMessages | null> {
  await ensureDbSchema();
  const db = getDb();
  const threadRows = await db.select().from(supportThreads).where(eq(supportThreads.id, threadId)).limit(1);
  if (threadRows.length === 0) return null;
  const messages = await db
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.threadId, threadId))
    .orderBy(supportMessages.createdAt);
  return {
    ...(threadRows[0] as SupportThreadRecord),
    messages: messages as SupportMessageRecord[],
  };
}

export async function getOpenSupportThreadForUser(clerkUserId: string): Promise<SupportThreadWithMessages | null> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(supportThreads)
    .where(and(eq(supportThreads.clerkUserId, clerkUserId), isNull(supportThreads.blockedAt)))
    .orderBy(desc(supportThreads.updatedAt))
    .limit(1);
  if (rows.length === 0) return null;
  return getSupportThread(rows[0].id);
}

export async function createSupportThread(params: {
  id: string;
  clerkUserId: string;
  discordUserId: string;
  ownerDiscordUserId: string;
  title: string;
  status?: SupportThreadStatus;
  discordChannelId?: string | null;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  const now = Date.now();
  await db.insert(supportThreads).values({
    id: params.id,
    clerkUserId: params.clerkUserId,
    discordUserId: params.discordUserId,
    ownerDiscordUserId: params.ownerDiscordUserId,
    discordChannelId: params.discordChannelId ?? null,
    title: params.title,
    status: params.status ?? 'open',
    blockedAt: null,
    blockedReason: null,
    contextSummary: null,
    contextJson: null,
    lastDiscordMessageId: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateSupportThread(params: {
  id: string;
  discordChannelId?: string | null;
  status?: SupportThreadStatus;
  blockedAt?: number | null;
  blockedReason?: string | null;
  contextSummary?: string | null;
  contextJson?: unknown;
  lastDiscordMessageId?: string | null;
  updatedAt?: number;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  const updateValues: Record<string, unknown> = {
    updatedAt: params.updatedAt ?? Date.now(),
  };
  if (params.discordChannelId !== undefined) updateValues.discordChannelId = params.discordChannelId;
  if (params.status !== undefined) updateValues.status = params.status;
  if (params.blockedAt !== undefined) updateValues.blockedAt = params.blockedAt;
  if (params.blockedReason !== undefined) updateValues.blockedReason = params.blockedReason;
  if (params.contextSummary !== undefined) updateValues.contextSummary = params.contextSummary;
  if (params.contextJson !== undefined) updateValues.contextJson = params.contextJson;
  if (params.lastDiscordMessageId !== undefined) updateValues.lastDiscordMessageId = params.lastDiscordMessageId;
  await db.update(supportThreads).set(updateValues).where(eq(supportThreads.id, params.id));
}

export async function addSupportMessage(params: {
  id: string;
  threadId: string;
  authorRole: SupportAuthorRole;
  content: string;
  source: SupportMessageSource;
  discordMessageId?: string | null;
  metadataJson?: unknown;
  createdAt?: number;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  const createdAt = params.createdAt ?? Date.now();
  await db.insert(supportMessages).values({
    id: params.id,
    threadId: params.threadId,
    authorRole: params.authorRole,
    content: params.content,
    source: params.source,
    discordMessageId: params.discordMessageId ?? null,
    metadataJson: params.metadataJson ?? null,
    createdAt,
  });
  await db.update(supportThreads).set({ updatedAt: createdAt }).where(eq(supportThreads.id, params.threadId));
}

export async function hasSupportMessageByDiscordMessageId(discordMessageId: string): Promise<boolean> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db
    .select({ id: supportMessages.id })
    .from(supportMessages)
    .where(eq(supportMessages.discordMessageId, discordMessageId))
    .limit(1);
  return rows.length > 0;
}
