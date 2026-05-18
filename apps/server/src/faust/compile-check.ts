import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_COMPILE_TIMEOUT_MS = 30000;

export async function compileFaustOrThrow(code: string, timeoutMs = DEFAULT_COMPILE_TIMEOUT_MS): Promise<void> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'hayashi-faust-check-'));
  const dspPath = resolve(workDir, 'plugin.dsp');
  const outPath = resolve(workDir, 'plugin.cpp');
  writeFileSync(dspPath, code, 'utf8');

  try {
    await Promise.race([
      new Promise<void>((resolvePromise, rejectPromise) => {
        const proc = spawn('faust', ['-o', outPath, dspPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stderr = '';
        proc.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        proc.on('error', (error) => {
          rejectPromise(new Error(`Faust compiler unavailable: ${error.message}`));
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolvePromise();
            return;
          }
          rejectPromise(new Error(stderr.trim() || `Faust compiler exited with code ${code}`));
        });
      }),
      new Promise<void>((_, rejectPromise) => {
        setTimeout(() => {
          rejectPromise(new Error(`Faust compilation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup failures
    }
  }
}
