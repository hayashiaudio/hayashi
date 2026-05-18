import { eq, desc, and } from 'drizzle-orm';
import { getDb, ensureDbSchema } from '../db/index.js';
import { plugins, pluginVersions, pluginMessages } from '../db/schema.js';

export type QualityLabel = 'good' | 'harsh' | 'muddy' | 'boring' | 'too_wet' | 'too_narrow' | 'unstable';

export interface PluginVersionRecord {
  id: string;
  pluginId: string;
  versionNumber: number;
  prompt: string;
  faustCode: string;
  paramsJson: string;
  specJson: unknown | null;
  templateId: string | null;
  toneModel: string | null;
  qualityProfile: string | null;
  stereoProfile: string | null;
  macroJson: unknown | null;
  uiSpecJson: unknown | null;
  evalMetricsJson: unknown | null;
  qualityLabelsJson: unknown | null;
  compileErrorsJson: unknown | null;
  artifactManifestJson: unknown | null;
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
  generationStatus: 'ready' | 'generating' | 'refining' | 'failed';
  generationError: string | null;
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
  generationStatus?: PluginThread['generationStatus'];
  generationError?: string | null;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  const now = Date.now();
  await db.insert(plugins).values({
    id: params.id,
    ownerId: params.ownerId,
    name: params.name,
    type: params.type,
    generationStatus: params.generationStatus ?? 'ready',
    generationError: params.generationError ?? null,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: plugins.id });
}

export async function updatePluginGenerationState(params: {
  pluginId: string;
  generationStatus: PluginThread['generationStatus'];
  generationError?: string | null;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  await db.update(plugins)
    .set({
      generationStatus: params.generationStatus,
      generationError: params.generationError ?? null,
      updatedAt: Date.now(),
    })
    .where(eq(plugins.id, params.pluginId));
}

export async function addVersion(params: {
  id: string;
  pluginId: string;
  versionNumber: number;
  prompt: string;
  faustCode: string;
  paramsJson: string;
  specJson?: unknown;
  templateId?: string | null;
  toneModel?: string | null;
  qualityProfile?: string | null;
  stereoProfile?: string | null;
  macroJson?: unknown;
  uiSpecJson?: unknown;
  evalMetricsJson?: unknown;
  qualityLabelsJson?: unknown;
  compileErrorsJson?: unknown;
  artifactManifestJson?: unknown;
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
    specJson: params.specJson ?? null,
    templateId: params.templateId ?? null,
    toneModel: params.toneModel ?? null,
    qualityProfile: params.qualityProfile ?? null,
    stereoProfile: params.stereoProfile ?? null,
    macroJson: params.macroJson ?? null,
    uiSpecJson: params.uiSpecJson ?? null,
    evalMetricsJson: params.evalMetricsJson ?? null,
    qualityLabelsJson: params.qualityLabelsJson ?? null,
    compileErrorsJson: params.compileErrorsJson ?? null,
    artifactManifestJson: params.artifactManifestJson ?? null,
    createdAt: Date.now(),
  });
  await db.update(plugins)
    .set({
      generationStatus: 'ready',
      generationError: null,
      updatedAt: Date.now(),
    })
    .where(eq(plugins.id, params.pluginId));
}

export async function setVersionQualityLabels(pluginId: string, versionId: string, labels: QualityLabel[]): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  await db.update(pluginVersions)
    .set({ qualityLabelsJson: labels })
    .where(eq(pluginVersions.id, versionId));
  await db.update(plugins)
    .set({ updatedAt: Date.now() })
    .where(eq(plugins.id, pluginId));
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
    generationStatus: (plugin.generationStatus as PluginThread['generationStatus']) ?? 'ready',
    generationError: plugin.generationError ?? null,
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
    versions,
    messages: messages as PluginMessageRecord[],
  };
}

export async function getPluginVersion(pluginId: string, versionNumber: number): Promise<PluginVersionRecord | null> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(pluginVersions)
    .where(and(eq(pluginVersions.pluginId, pluginId), eq(pluginVersions.versionNumber, versionNumber)))
    .limit(1);
  return rows[0] ?? null;
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
