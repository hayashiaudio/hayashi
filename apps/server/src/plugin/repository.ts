import { eq, desc } from 'drizzle-orm';
import { getDb, ensureDbSchema } from '../db/index.js';
import { plugins, pluginVersions, pluginMessages } from '../db/schema.js';

export interface PluginVersionRecord {
  id: string;
  pluginId: string;
  versionNumber: number;
  prompt: string;
  faustCode: string;
  paramsJson: string;
  createdAt: number;
}

export interface PluginMessageRecord {
  id: string;
  pluginId: string;
  role: 'user' | 'assistant';
  content: string;
  versionId: string | null;
  createdAt: number;
}

export interface PluginThread {
  id: string;
  ownerId: string;
  name: string;
  type: string;
  createdAt: number;
  updatedAt: number;
  versions: PluginVersionRecord[];
  messages: PluginMessageRecord[];
}

export async function createPlugin(params: {
  id: string;
  ownerId: string;
  name: string;
  type: string;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  const now = Date.now();
  await db.insert(plugins).values({
    id: params.id,
    ownerId: params.ownerId,
    name: params.name,
    type: params.type,
    createdAt: now,
    updatedAt: now,
  });
}

export async function addVersion(params: {
  id: string;
  pluginId: string;
  versionNumber: number;
  prompt: string;
  faustCode: string;
  paramsJson: string;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  await db.insert(pluginVersions).values({
    id: params.id,
    pluginId: params.pluginId,
    versionNumber: params.versionNumber,
    prompt: params.prompt,
    faustCode: params.faustCode,
    paramsJson: params.paramsJson,
    createdAt: Date.now(),
  });
  await db.update(plugins)
    .set({ updatedAt: Date.now() })
    .where(eq(plugins.id, params.pluginId));
}

export async function addMessage(params: {
  id: string;
  pluginId: string;
  role: 'user' | 'assistant';
  content: string;
  versionId?: string;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  await db.insert(pluginMessages).values({
    id: params.id,
    pluginId: params.pluginId,
    role: params.role,
    content: params.content,
    versionId: params.versionId ?? null,
    createdAt: Date.now(),
  });
}

export async function getPluginThread(pluginId: string): Promise<PluginThread | null> {
  await ensureDbSchema();
  const db = getDb();

  const pluginRows = await db.select().from(plugins).where(eq(plugins.id, pluginId)).limit(1);
  if (pluginRows.length === 0) return null;
  const plugin = pluginRows[0];

  const versions = await db
    .select()
    .from(pluginVersions)
    .where(eq(pluginVersions.pluginId, pluginId))
    .orderBy(desc(pluginVersions.versionNumber));

  const messages = await db
    .select()
    .from(pluginMessages)
    .where(eq(pluginMessages.pluginId, pluginId))
    .orderBy(pluginMessages.createdAt);

  return {
    id: plugin.id,
    ownerId: plugin.ownerId,
    name: plugin.name,
    type: plugin.type,
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
    versions,
    messages: messages as PluginMessageRecord[],
  };
}

export async function getLatestVersionNumber(pluginId: string): Promise<number> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db
    .select({ versionNumber: pluginVersions.versionNumber })
    .from(pluginVersions)
    .where(eq(pluginVersions.pluginId, pluginId))
    .orderBy(desc(pluginVersions.versionNumber))
    .limit(1);
  return rows[0]?.versionNumber ?? 0;
}

export async function listPluginsForUser(ownerId: string): Promise<PluginThread[]> {
  await ensureDbSchema();
  const db = getDb();
  const pluginRows = await db
    .select()
    .from(plugins)
    .where(eq(plugins.ownerId, ownerId))
    .orderBy(desc(plugins.updatedAt));

  const threads: PluginThread[] = [];
  for (const plugin of pluginRows) {
    const thread = await getPluginThread(plugin.id);
    if (thread) threads.push(thread);
  }
  return threads;
}
