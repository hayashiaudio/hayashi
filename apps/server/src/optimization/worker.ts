import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { resolve } from 'path';
import type { OptimizerJobInput, OptimizerJobResult } from './contracts.js';
import { getOptimizationArchitecture } from './category-registry.js';

function defaultStubResult(input: OptimizerJobInput): OptimizerJobResult {
  const architecture = getOptimizationArchitecture(input.category, input.architectureId);
  const params = Object.fromEntries(
    architecture.parameterRanges.map((range) => [range.id, range.initial]),
  );

  return {
    winner: {
      architectureId: input.architectureId,
      params,
      score: 0,
      metrics: [],
    },
    rejectedRegions: [],
  };
}

export function resolveOptimizerBinary(): string | null {
  const candidate = resolve(process.cwd(), 'native/optimizer/build/hayashi_optimizer');
  return existsSync(candidate) ? candidate : null;
}

export async function runOptimizerJob(input: OptimizerJobInput): Promise<OptimizerJobResult> {
  const binary = resolveOptimizerBinary();
  if (!binary) {
    return defaultStubResult(input);
  }

  return new Promise<OptimizerJobResult>((resolvePromise, rejectPromise) => {
    const child = spawn(binary, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      rejectPromise(error);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`Optimizer worker failed with exit code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as OptimizerJobResult;
        resolvePromise(parsed);
      } catch (error) {
        rejectPromise(new Error(`Optimizer worker returned invalid JSON: ${String(error)}\n${stdout}\n${stderr}`));
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
