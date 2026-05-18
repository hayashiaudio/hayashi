import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, ensureDbSchema } from '../db/index.js';
import { buildLogs, builds, plugins, pluginVersions } from '../db/schema.js';
import type { BuildFormat, BuildTarget } from './targets.js';

export type BuildStatus = 'queued' | 'running' | 'completed' | 'failed';
export type BuildStage =
  | 'queued'
  | 'preparing'
  | 'dispatching'
  | 'building_dpf'
  | 'building_ui'
  | 'packaging'
  | 'uploading'
  | 'completed'
  | 'failed';

export interface BuildRecord {
  id: string;
  pluginId: string;
  versionId: string;
  ownerId: string;
  format: BuildFormat;
  target: BuildTarget;
  workflowId: string | null;
  status: BuildStatus;
  stage: BuildStage;
  statusMessage: string | null;
  filename: string | null;
  downloadUrl: string | null;
  errorMessage: string | null;
  startedAt: number | null;
  completedAt: number | null;
  metadataJson: unknown | null;
  createdAt: number;
  updatedAt: number;
}

export interface BuildListItem extends BuildRecord {
  pluginName: string | null;
  versionNumber: number | null;
}

export interface BuildExecutionPayload extends BuildRecord {
  pluginName: string;
  versionNumber: number;
  faustCode: string;
  uiSpecJson: unknown | null;
  macroJson: unknown | null;
}

export type BuildLogLevel = 'info' | 'warn' | 'error';

export interface BuildLogRecord {
  id: string;
  buildId: string;
  level: BuildLogLevel;
  stage: BuildStage;
  source: string | null;
  message: string;
  createdAt: number;
}

function coerceBuildRecord<T extends { format: string; target: string; status: string; stage: string }>(row: T): T & {
  format: BuildFormat;
  target: BuildTarget;
  status: BuildStatus;
  stage: BuildStage;
} {
  return row as T & {
    format: BuildFormat;
    target: BuildTarget;
    status: BuildStatus;
    stage: BuildStage;
  };
}

export async function createBuild(params: {
  id: string;
  pluginId: string;
  versionId: string;
  ownerId: string;
  format: BuildFormat;
  target: BuildTarget;
  workflowId?: string | null;
  status?: BuildStatus;
  stage?: BuildStage;
  statusMessage?: string | null;
  metadataJson?: unknown;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  const now = Date.now();
  await db.insert(builds).values({
    id: params.id,
    pluginId: params.pluginId,
    versionId: params.versionId,
    ownerId: params.ownerId,
    format: params.format,
    target: params.target,
    workflowId: params.workflowId ?? null,
    status: params.status ?? 'queued',
    stage: params.stage ?? 'queued',
    statusMessage: params.statusMessage ?? null,
    filename: null,
    downloadUrl: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    metadataJson: params.metadataJson ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateBuild(params: {
  id: string;
  status?: BuildStatus;
  stage?: BuildStage;
  statusMessage?: string | null;
  workflowId?: string | null;
  filename?: string | null;
  downloadUrl?: string | null;
  errorMessage?: string | null;
  startedAt?: number | null;
  completedAt?: number | null;
  metadataJson?: unknown;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  const updateValues: Record<string, unknown> = {
    updatedAt: Date.now(),
  };
  if (params.status !== undefined) updateValues.status = params.status;
  if (params.stage !== undefined) updateValues.stage = params.stage;
  if (params.statusMessage !== undefined) updateValues.statusMessage = params.statusMessage;
  if (params.workflowId !== undefined) updateValues.workflowId = params.workflowId;
  if (params.filename !== undefined) updateValues.filename = params.filename;
  if (params.downloadUrl !== undefined) updateValues.downloadUrl = params.downloadUrl;
  if (params.errorMessage !== undefined) updateValues.errorMessage = params.errorMessage;
  if (params.startedAt !== undefined) updateValues.startedAt = params.startedAt;
  if (params.completedAt !== undefined) updateValues.completedAt = params.completedAt;
  if (params.metadataJson !== undefined) updateValues.metadataJson = params.metadataJson;
  await db
    .update(builds)
    .set(updateValues)
    .where(eq(builds.id, params.id));
}

export async function getBuild(id: string): Promise<BuildRecord | null> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db.select().from(builds).where(eq(builds.id, id)).limit(1);
  return rows[0] ? coerceBuildRecord(rows[0]) : null;
}

export async function getBuildExecutionPayload(buildId: string): Promise<BuildExecutionPayload | null> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db
    .select({
      id: builds.id,
      pluginId: builds.pluginId,
      versionId: builds.versionId,
      ownerId: builds.ownerId,
      format: builds.format,
      target: builds.target,
      workflowId: builds.workflowId,
      status: builds.status,
      stage: builds.stage,
      statusMessage: builds.statusMessage,
      filename: builds.filename,
      downloadUrl: builds.downloadUrl,
      errorMessage: builds.errorMessage,
      startedAt: builds.startedAt,
      completedAt: builds.completedAt,
      metadataJson: builds.metadataJson,
      createdAt: builds.createdAt,
      updatedAt: builds.updatedAt,
      pluginName: plugins.name,
      versionNumber: pluginVersions.versionNumber,
      faustCode: pluginVersions.faustCode,
      uiSpecJson: pluginVersions.uiSpecJson,
      macroJson: pluginVersions.macroJson,
    })
    .from(builds)
    .innerJoin(plugins, eq(builds.pluginId, plugins.id))
    .innerJoin(pluginVersions, eq(builds.versionId, pluginVersions.id))
    .where(eq(builds.id, buildId))
    .limit(1);
  return rows[0] ? coerceBuildRecord(rows[0]) : null;
}

export async function findActiveBuildForVersion(
  ownerId: string,
  pluginId: string,
  versionId: string,
  target: BuildTarget,
): Promise<BuildRecord | null> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(builds)
    .where(and(
      eq(builds.ownerId, ownerId),
      eq(builds.pluginId, pluginId),
      eq(builds.versionId, versionId),
      eq(builds.target, target),
      inArray(builds.status, ['queued', 'running']),
    ))
    .orderBy(desc(builds.updatedAt))
    .limit(1);
  return rows[0] ? coerceBuildRecord(rows[0]) : null;
}

export async function listBuildsForUser(ownerId: string, limit = 24): Promise<BuildListItem[]> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db
    .select({
      id: builds.id,
      pluginId: builds.pluginId,
      versionId: builds.versionId,
      ownerId: builds.ownerId,
      format: builds.format,
      target: builds.target,
      workflowId: builds.workflowId,
      status: builds.status,
      stage: builds.stage,
      statusMessage: builds.statusMessage,
      filename: builds.filename,
      downloadUrl: builds.downloadUrl,
      errorMessage: builds.errorMessage,
      startedAt: builds.startedAt,
      completedAt: builds.completedAt,
      metadataJson: builds.metadataJson,
      createdAt: builds.createdAt,
      updatedAt: builds.updatedAt,
      pluginName: plugins.name,
      versionNumber: pluginVersions.versionNumber,
    })
    .from(builds)
    .innerJoin(plugins, eq(builds.pluginId, plugins.id))
    .innerJoin(pluginVersions, eq(builds.versionId, pluginVersions.id))
    .where(eq(builds.ownerId, ownerId))
    .orderBy(desc(builds.updatedAt))
    .limit(limit);
  return rows.map((row) => coerceBuildRecord(row));
}

export async function appendBuildLog(params: {
  id: string;
  buildId: string;
  level: BuildLogLevel;
  stage: BuildStage;
  source?: string | null;
  message: string;
  createdAt?: number;
}): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  await db.insert(buildLogs).values({
    id: params.id,
    buildId: params.buildId,
    level: params.level,
    stage: params.stage,
    source: params.source ?? null,
    message: params.message,
    createdAt: params.createdAt ?? Date.now(),
  });
}

export async function listBuildLogs(buildId: string, limit = 400): Promise<BuildLogRecord[]> {
  await ensureDbSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(buildLogs)
    .where(eq(buildLogs.buildId, buildId))
    .orderBy(buildLogs.createdAt)
    .limit(limit);
  return rows as BuildLogRecord[];
}
