import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { StableOptimizationArtifactContract } from './normalize.js';
import type { OptimizerJobInput, OptimizerJobResult } from './contracts.js';
import type { OptimizationScoreSummary } from './scoring.js';

export interface OptimizationTraceRecord {
  schemaVersion: '1.0';
  createdAt: number;
  job: OptimizerJobInput;
  optimizer: OptimizerJobResult;
  score: OptimizationScoreSummary;
  artifacts: Pick<StableOptimizationArtifactContract, 'metadata' | 'uiSpec'>;
}

function traceDirectory(): string {
  return resolve(process.cwd(), 'tmp', 'optimization-traces');
}

export function persistOptimizationTrace(record: OptimizationTraceRecord): string {
  const dir = traceDirectory();
  mkdirSync(dir, { recursive: true });
  const filename = `${record.job.category}-${record.job.architectureId}-${record.job.seed}-${record.createdAt}.json`;
  const filePath = resolve(dir, filename);
  writeFileSync(filePath, JSON.stringify(record, null, 2));
  return filePath;
}
