import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { PluginThread, PluginVersionRecord, QualityLabel } from './repository.js';

const LOG_PATH = process.env.HAYASHI_OBSERVABILITY_LOG_PATH?.trim() || '/tmp/hayashi/observability/generations.ndjson';

type GenerationEventName =
  | 'generation_succeeded'
  | 'generation_failed'
  | 'iteration_succeeded'
  | 'iteration_failed';

export interface GenerationEvent {
  timestamp: number;
  event: GenerationEventName;
  pluginId?: string;
  versionId?: string;
  ownerId?: string;
  pluginType?: string;
  prompt?: string;
  templateId?: string | null;
  toneModel?: string | null;
  qualityProfile?: string | null;
  stereoProfile?: string | null;
  candidateCount?: number;
  selectedCandidateId?: string | null;
  compileErrorCount?: number;
  failedChecks?: number;
  overallScore?: number | null;
  error?: string;
}

export interface GenerationDashboard {
  generatedAt: number;
  totals: {
    pluginCount: number;
    versionCount: number;
    iterationCount: number;
  };
  validation: {
    versionsWithCompileRepairs: number;
    totalCompileRepairEvents: number;
    recentFailures: GenerationEvent[];
  };
  ranking: {
    averageOverallScore: number | null;
    averageCandidateCount: number | null;
    versionsWithFailedChecks: number;
  };
  architectures: Array<{
    templateId: string;
    count: number;
    averageOverallScore: number | null;
  }>;
  iterationPatterns: {
    pluginsWithIterations: number;
    averageVersionsPerPlugin: number;
    averageIterationsPerPlugin: number;
  };
  qualityLabels: Array<{
    label: QualityLabel;
    count: number;
  }>;
}

function ensureLogDir() {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
}

export function logGenerationEvent(event: GenerationEvent): void {
  try {
    ensureLogDir();
    const payload = JSON.stringify(event);
    appendFileSync(LOG_PATH, `${payload}\n`, 'utf8');
    console.log(`[HayashiObs] ${payload}`);
  } catch (error) {
    console.error('[HayashiObs] Failed to write observability event:', error);
  }
}

export function readRecentGenerationEvents(limit = 50): GenerationEvent[] {
  try {
    if (!existsSync(LOG_PATH)) return [];
    const lines = readFileSync(LOG_PATH, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line) as GenerationEvent).reverse();
  } catch {
    return [];
  }
}

function numericMetric(version: PluginVersionRecord, path: string[]): number | null {
  let cursor: unknown = version.evalMetricsJson;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || !(key in cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === 'number' ? cursor : null;
}

function candidateCount(version: PluginVersionRecord): number | null {
  return numericMetric(version, ['candidateLineage', 'candidateCount']);
}

function selectedFailedChecks(version: PluginVersionRecord): number {
  const candidateLineage = version.evalMetricsJson && typeof version.evalMetricsJson === 'object'
    ? (version.evalMetricsJson as Record<string, unknown>).candidateLineage
    : null;
  const summaries = candidateLineage && typeof candidateLineage === 'object'
    ? (candidateLineage as Record<string, unknown>).summaries
    : null;
  const selectedCandidateId = candidateLineage && typeof candidateLineage === 'object'
    ? (candidateLineage as Record<string, unknown>).selectedCandidateId
    : null;

  if (!Array.isArray(summaries) || typeof selectedCandidateId !== 'string') return 0;
  const match = summaries.find((item) => {
    if (!item || typeof item !== 'object') return false;
    return (item as Record<string, unknown>).candidateId === selectedCandidateId;
  }) as Record<string, unknown> | undefined;
  return typeof match?.failedChecks === 'number' ? match.failedChecks : 0;
}

function versionLabels(version: PluginVersionRecord): QualityLabel[] {
  return Array.isArray(version.qualityLabelsJson) ? version.qualityLabelsJson as QualityLabel[] : [];
}

export function buildGenerationDashboard(threads: PluginThread[]): GenerationDashboard {
  const versions = threads.flatMap((thread) => thread.versions);
  const recentFailures = readRecentGenerationEvents(50).filter((event) =>
    event.event === 'generation_failed' || event.event === 'iteration_failed'
  );

  const overallScores = versions
    .map((version) => numericMetric(version, ['metrics', 'overallScore']))
    .filter((value): value is number => typeof value === 'number');
  const candidateCounts = versions
    .map((version) => candidateCount(version))
    .filter((value): value is number => typeof value === 'number');

  const architectureMap = new Map<string, { count: number; scores: number[] }>();
  const qualityLabelMap = new Map<QualityLabel, number>();
  let versionsWithFailedChecks = 0;

  for (const version of versions) {
    const templateId = version.templateId ?? 'unknown';
    const overallScore = numericMetric(version, ['metrics', 'overallScore']);
    const existing = architectureMap.get(templateId) ?? { count: 0, scores: [] };
    existing.count += 1;
    if (typeof overallScore === 'number') existing.scores.push(overallScore);
    architectureMap.set(templateId, existing);

    if (selectedFailedChecks(version) > 0) versionsWithFailedChecks += 1;

    for (const label of versionLabels(version)) {
      qualityLabelMap.set(label, (qualityLabelMap.get(label) ?? 0) + 1);
    }
  }

  const average = (values: number[]) => values.length > 0
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
    : null;

  return {
    generatedAt: Date.now(),
    totals: {
      pluginCount: threads.length,
      versionCount: versions.length,
      iterationCount: versions.filter((version) => version.versionNumber > 1).length,
    },
    validation: {
      versionsWithCompileRepairs: versions.filter((version) => Array.isArray(version.compileErrorsJson) && version.compileErrorsJson.length > 0).length,
      totalCompileRepairEvents: versions.reduce((sum, version) => sum + (Array.isArray(version.compileErrorsJson) ? version.compileErrorsJson.length : 0), 0),
      recentFailures,
    },
    ranking: {
      averageOverallScore: average(overallScores),
      averageCandidateCount: average(candidateCounts),
      versionsWithFailedChecks,
    },
    architectures: [...architectureMap.entries()]
      .map(([templateId, value]) => ({
        templateId,
        count: value.count,
        averageOverallScore: average(value.scores),
      }))
      .sort((left, right) => right.count - left.count),
    iterationPatterns: {
      pluginsWithIterations: threads.filter((thread) => thread.versions.length > 1).length,
      averageVersionsPerPlugin: threads.length > 0 ? Number((versions.length / threads.length).toFixed(4)) : 0,
      averageIterationsPerPlugin: threads.length > 0 ? Number((versions.filter((version) => version.versionNumber > 1).length / threads.length).toFixed(4)) : 0,
    },
    qualityLabels: [...qualityLabelMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count),
  };
}
