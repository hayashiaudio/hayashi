import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { evaluateMeasuredFaust, evaluateFaustSpec, type FaustEvaluationMetrics, type FaustMeasuredValues } from './measurement.js';
import type { PluginSpec } from './spec-runtime.js';

const ENABLE_AUDIO_ANALYSIS = (process.env.ENABLE_AUDIO_ANALYSIS ?? '').trim().toLowerCase() === 'true';
const RENDER_COMMAND = process.env.FAUST_RENDER_COMMAND?.trim() || 'hayashi-faust-render';
const ANALYZE_COMMAND = process.env.ESSENTIA_ANALYZE_COMMAND?.trim() || 'hayashi-essentia-analyze';
const RENDER_TIMEOUT_MS = Number(process.env.FAUST_RENDER_TIMEOUT_MS ?? 10000);
const ANALYZE_TIMEOUT_MS = Number(process.env.ESSENTIA_ANALYZE_TIMEOUT_MS ?? 10000);

interface RenderFixture {
  schemaVersion: '1.0';
  architecture: string;
  kind: PluginSpec['kind'];
  sampleRate: number;
  durationSeconds: number;
  channels: number;
  scenario: Record<string, unknown>;
}

interface AnalyzerJson {
  peakDb?: number;
  rms?: number;
  dcOffset?: number;
  stereoCorrelation?: number;
  spectralCentroidHz?: number;
  decayMs?: number;
  silenceRatio?: number;
  clippingRatio?: number;
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
  return Promise.race([
    new Promise<void>((resolvePromise, rejectPromise) => {
      const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('error', (error) => {
        rejectPromise(new Error(`${command} unavailable: ${error.message}`));
      });
      proc.on('close', (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        rejectPromise(new Error([
          `${command} failed with exit code ${code}.`,
          stderr.trim(),
          stdout.trim(),
        ].filter(Boolean).join('\n')));
      });
    }),
    new Promise<void>((_, rejectPromise) => {
      setTimeout(() => {
        rejectPromise(new Error(`${command} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    }),
  ]);
}

function buildFixture(spec: PluginSpec): RenderFixture {
  if (spec.kind === 'effect') {
    return {
      schemaVersion: '1.0',
      architecture: spec.voiceArchitecture,
      kind: spec.kind,
      sampleRate: 48000,
      durationSeconds: 4,
      channels: spec.io.outputs,
      scenario: {
        type: 'effect-fixture',
        input: spec.io.inputs === 2 ? 'stereo_phrase_plus_impulse' : 'mono_phrase_plus_impulse',
      },
    };
  }

  if (spec.kind === 'percussion') {
    return {
      schemaVersion: '1.0',
      architecture: spec.voiceArchitecture,
      kind: spec.kind,
      sampleRate: 48000,
      durationSeconds: 2,
      channels: spec.io.outputs,
      scenario: {
        type: 'percussion-fixture',
        midi: [
          { timeSeconds: 0.0, noteHz: 180, velocity: 1.0, durationSeconds: 0.05 },
          { timeSeconds: 0.5, noteHz: 220, velocity: 0.85, durationSeconds: 0.05 },
          { timeSeconds: 1.0, noteHz: 160, velocity: 0.9, durationSeconds: 0.05 },
        ],
      },
    };
  }

  return {
    schemaVersion: '1.0',
    architecture: spec.voiceArchitecture,
    kind: spec.kind,
    sampleRate: 48000,
    durationSeconds: 4,
    channels: spec.io.outputs,
    scenario: {
      type: 'synth-fixture',
      midi: spec.voiceArchitecture === 'supersaw_pad'
        ? [
            { timeSeconds: 0.0, noteHz: 220, velocity: 0.92, durationSeconds: 2.8 },
            { timeSeconds: 0.0, noteHz: 277.18, velocity: 0.82, durationSeconds: 2.8 },
            { timeSeconds: 0.0, noteHz: 329.63, velocity: 0.8, durationSeconds: 2.8 },
          ]
        : [
            { timeSeconds: 0.0, noteHz: 55, velocity: 1.0, durationSeconds: 0.55 },
            { timeSeconds: 0.7, noteHz: 65.41, velocity: 0.95, durationSeconds: 0.45 },
            { timeSeconds: 1.3, noteHz: 73.42, velocity: 0.92, durationSeconds: 0.45 },
            { timeSeconds: 1.9, noteHz: 82.41, velocity: 0.88, durationSeconds: 0.5 },
          ],
    },
  };
}

function requireFiniteNumber(value: unknown, field: keyof AnalyzerJson): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Essentia analysis output missing valid numeric field: ${field}`);
  }
  return num;
}

function normalizeAnalyzerOutput(json: AnalyzerJson): FaustMeasuredValues {
  return {
    peakDb: requireFiniteNumber(json.peakDb, 'peakDb'),
    rms: requireFiniteNumber(json.rms, 'rms'),
    dcOffset: requireFiniteNumber(json.dcOffset, 'dcOffset'),
    stereoCorrelation: requireFiniteNumber(json.stereoCorrelation, 'stereoCorrelation'),
    spectralCentroidHz: requireFiniteNumber(json.spectralCentroidHz, 'spectralCentroidHz'),
    decayMs: requireFiniteNumber(json.decayMs, 'decayMs'),
    silenceRatio: requireFiniteNumber(json.silenceRatio, 'silenceRatio'),
    clippingRatio: requireFiniteNumber(json.clippingRatio, 'clippingRatio'),
  };
}

function isInfrastructureError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('unavailable') || lower.includes('timed out') || lower.includes('enoent');
}

export async function analyzeFaustAudioOrThrow(spec: PluginSpec, faustCode: string): Promise<FaustEvaluationMetrics> {
  // Audio rendering is expensive; default to fast heuristic evaluator unless explicitly enabled.
  if (!ENABLE_AUDIO_ANALYSIS) {
    return evaluateFaustSpec(spec, faustCode);
  }

  const workDir = mkdtempSync(resolve(tmpdir(), 'hayashi-faust-analysis-'));
  const dspPath = resolve(workDir, 'plugin.dsp');
  const fixturePath = resolve(workDir, 'fixture.json');
  const wavPath = resolve(workDir, 'render.wav');
  const metricsPath = resolve(workDir, 'metrics.json');

  writeFileSync(dspPath, faustCode, 'utf8');
  writeFileSync(fixturePath, JSON.stringify(buildFixture(spec), null, 2), 'utf8');

  try {
    await runCommand(RENDER_COMMAND, ['--dsp', dspPath, '--fixture', fixturePath, '--output', wavPath], RENDER_TIMEOUT_MS);
    await runCommand(ANALYZE_COMMAND, ['--input', wavPath, '--output', metricsPath], ANALYZE_TIMEOUT_MS);

    const analyzerJson = JSON.parse(readFileSync(metricsPath, 'utf8')) as AnalyzerJson;
    const measured = normalizeAnalyzerOutput(analyzerJson);
    const notes: string[] = [];
    if (measured.clippingRatio > 0.01) notes.push('Rendered analysis detected clipping activity.');
    if (Math.abs(measured.dcOffset) > 0.01) notes.push('Rendered analysis detected notable DC offset.');
    if (measured.silenceRatio > 0.9) notes.push('Rendered analysis detected mostly silent output.');

    return evaluateMeasuredFaust(spec, measured, notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isInfrastructureError(message)) {
      console.warn(`[Hayashi] Audio analysis infrastructure unavailable, falling back to heuristic evaluator: ${message}`);
      return evaluateFaustSpec(spec, faustCode);
    }
    throw new Error(`Faust audio analysis failed: ${message}`);
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup failures
    }
  }
}
