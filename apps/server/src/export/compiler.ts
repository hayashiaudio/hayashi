import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, mkdtempSync, copyFileSync, existsSync, readdirSync, statSync, cpSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir, cpus } from 'os';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { uploadAsset, getAssetUrl, s3 } from '../storage.js';
import { generateElementsUi } from './ui-codegen.js';
import { generateDpfWrapper } from './dpf-codegen.js';
import { formatForTarget, platformForTarget, type BuildTarget } from '../build/targets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface CompileResult {
  downloadUrl: string;
  fromCache: boolean;
  filename: string;
}

export type CompileProgressStage =
  | 'preparing'
  | 'building_dpf'
  | 'building_ui'
  | 'packaging'
  | 'uploading'
  | 'completed';

interface CompileOptions {
  onProgress?: (stage: CompileProgressStage, message: string) => void | Promise<void>;
  onLog?: (level: 'info' | 'warn' | 'error', stage: CompileProgressStage, message: string, source?: string | null) => void | Promise<void>;
}

interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void | Promise<void>;
  onStderr?: (chunk: string) => void | Promise<void>;
}

const EXPORT_CACHE_VERSION = 'v3';

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: process.env.BUCKET_NAME ?? 'hayashi-assets', Key: key }));
    return true;
  } catch {
    return false;
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function resolveBundledExportAsset(filename: string): string | null {
  const distPath = resolve(__dirname, filename);
  if (existsSync(distPath)) return distPath;

  const sourcePath = resolve(__dirname, '../../src/export', filename);
  if (existsSync(sourcePath)) return sourcePath;

  return null;
}

function createLineBuffer(onLine: (line: string) => void) {
  let buffer = '';
  return {
    push: (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed.length > 0) {
          onLine(trimmed.slice(0, 4000));
        }
      }
    },
    flush: () => {
      const trimmed = buffer.trimEnd();
      buffer = '';
      if (trimmed.length > 0) {
        onLine(trimmed.slice(0, 4000));
      }
    },
  };
}

function explainNativeBuildFailure(message: string): string {
  if (
    message.includes('libelements.a')
    && message.includes('can not be used when making a shared object')
    && message.includes('recompile with -fPIC')
  ) {
    return [
      'Native export failed: the installed `libelements.a` was built without position-independent code (`-fPIC`).',
      'VST3/CLAP targets are shared libraries, so the linker rejects that archive.',
      'Rebuild/reinstall Cycfi Elements as a PIC-safe static library, or link against a shared `libelements` build.',
      'This is a toolchain issue on the export host, not a problem with the generated Faust DSP.',
    ].join(' ');
  }

  return message;
}

function findDpfArtifactPath(baseDir: string, safePluginName: string, format: 'vst3' | 'clap'): string | null {
  const candidates = [
    resolve(baseDir, 'dpf_build', 'bin'),
    resolve(baseDir, 'bin'),
    '/bin',
  ];

  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir);
      const exactName = `${safePluginName}.${format}`;
      const exactMatch = entries.find((entry) => entry === exactName);
      if (exactMatch) return resolve(dir, exactMatch);

      const prefixedMatch = entries.find((entry) => entry.startsWith(`${safePluginName}.`) && entry.endsWith(`.${format}`));
      if (prefixedMatch) return resolve(dir, prefixedMatch);

      if (format === 'vst3') {
        const vst3Match = entries.find((entry) => entry.endsWith('.vst3'));
        if (vst3Match) return resolve(dir, vst3Match);
      }

      if (format === 'clap') {
        const clapMatch = entries.find((entry) => entry.endsWith('.clap'));
        if (clapMatch) return resolve(dir, clapMatch);
      }
    } catch {
      // ignore unreadable candidate directories
    }
  }

  return null;
}

function exec(command: string, args: string[], options: ExecOptions = {}): Promise<void> {
  const { cwd, timeoutMs = 30000, onStdout, onStderr } = options;
  return new Promise<void>((res, rej) => {
    const proc = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const MAX_OUTPUT = 1024 * 1024; // 1MB
    const stdoutBuffer = onStdout ? createLineBuffer(onStdout) : null;
    const stderrBuffer = onStderr ? createLineBuffer(onStderr) : null;

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        // Always attempt SIGKILL; proc.killed is set immediately on kill()
        // so relying on it prevents the fallback from ever running.
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 5000);
      rej(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    proc.stdout.on('data', (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += d;
      stdoutBuffer?.push(d.toString());
    });
    proc.stderr.on('data', (d) => {
      if (stderr.length < MAX_OUTPUT) stderr += d;
      stderrBuffer?.push(d.toString());
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      stdoutBuffer?.flush();
      stderrBuffer?.flush();
      if (code !== 0) {
        rej(new Error(`Command failed: ${command} ${args.join(' ')}
${stderr}
${stdout}`));
      } else {
        res();
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      rej(err);
    });
  });
}

function execCapture(command: string, args: string[], cwd?: string, timeoutMs = 30000): Promise<string> {
  return new Promise<string>((res, rej) => {
    const proc = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const MAX_OUTPUT = 1024 * 1024;

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        // Always attempt SIGKILL; proc.killed is set immediately on kill()
        // so relying on it prevents the fallback from ever running.
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 5000);
      rej(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    proc.stdout.on('data', (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += d;
    });
    proc.stderr.on('data', (d) => {
      if (stderr.length < MAX_OUTPUT) stderr += d;
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        rej(new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr}\n${stdout}`));
      } else {
        res(stdout.trim());
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      rej(err);
    });
  });
}

export async function compileDspToNative(
  sourceCode: string,
  pluginName: string,
  pluginId: string,
  version: string,
  target: BuildTarget,
  uiSpecJson?: unknown,
  macroJson?: unknown,
  options: CompileOptions = {},
): Promise<CompileResult> {
  const format = formatForTarget(target);
  const platform = platformForTarget(target);
  const includeUi = process.env.ENABLE_ELEMENTS_PLUGIN_UI !== '0';
  const hash = sha256(JSON.stringify({
    sourceCode,
    target,
    uiSpecJson: uiSpecJson ?? null,
    macroJson: macroJson ?? null,
    exportCacheVersion: EXPORT_CACHE_VERSION,
  }));
  const safePluginName = pluginName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const archiveFilename = `${safePluginName}-${target}.bundle.tar.gz`;
  const contentDisposition = `attachment; filename="${archiveFilename}"`;
  const tigrisKey = `plugins/${pluginId}/${version}/exports/${target}/${EXPORT_CACHE_VERSION}-${hash}/${archiveFilename}`;
  const dspKey = `plugins/${pluginId}/${version}/source.dsp`;
  const reportProgress = async (stage: CompileProgressStage, message: string) => {
    await options.onProgress?.(stage, message);
  };
  const reportLog = async (level: 'info' | 'warn' | 'error', stage: CompileProgressStage, message: string, source?: string | null) => {
    await options.onLog?.(level, stage, message, source);
  };

  // Check Tigris cache — if the compiled binary exists, return a signed URL
  await reportProgress('preparing', 'Checking cached build artifacts');
  await reportLog('info', 'preparing', `Checking cached artifacts for ${format.toUpperCase()} export`, 'compiler');
  const cacheKey = (await objectExists(tigrisKey)) ? tigrisKey : null;
  if (cacheKey) {
    const downloadUrl = await getAssetUrl(cacheKey, 3600, contentDisposition);
    await reportProgress('completed', 'Using cached plugin artifact');
    await reportLog('info', 'completed', `Using cached artifact: ${cacheKey}`, 'cache');
    return { downloadUrl, fromCache: true, filename: archiveFilename };
  }

  const workDir = mkdtempSync(resolve(tmpdir(), `hayashi-export-${hash}-`));

  const dspPath = resolve(workDir, 'plugin.dsp');
  writeFileSync(dspPath, sourceCode);

  let dpfBuildSucceeded = false;
  let dpfBuildError: Error | null = null;

  try {
    const dpfPath = process.env.DPF_PATH ?? '/usr/local/share/dpf';

    // ── Generate UI code if spec is available ───────────────────────────
    let dspClassPath: string | undefined;
    let uiSourcePath: string | undefined;
    if (includeUi) {
      if (!uiSpecJson || !macroJson || !Array.isArray(macroJson)) {
        throw new Error('Native export was configured to include a generated UI, but the UI spec or macro controls were missing.');
      }

      await reportProgress('preparing', 'Generating Faust UI wrapper code');
      await reportLog('info', 'preparing', 'Generating HayashiDSP.h and Elements UI wrapper', 'faust');
      const uiSpec = uiSpecJson as Parameters<typeof generateElementsUi>[0];
      const macros = macroJson as Parameters<typeof generateElementsUi>[1];

      dspClassPath = resolve(workDir, 'HayashiDSP.h');
      await exec('faust', ['-cn', 'HayashiDSP', '-i', dspPath, '-o', dspClassPath], {
        onStdout: (line) => reportLog('info', 'preparing', line, 'faust stdout'),
        onStderr: (line) => reportLog('warn', 'preparing', line, 'faust stderr'),
      });

      const generated = generateElementsUi(uiSpec, macros);
      const uiHeaderPath = resolve(workDir, 'plugin_ui.h');
      uiSourcePath = resolve(workDir, 'plugin_ui.cpp');
      writeFileSync(uiHeaderPath, generated.header);
      writeFileSync(uiSourcePath, generated.source);
    }

    // ── Step 1: DPF multi-format build ─────────────────────────────────
    if ((dspClassPath || !includeUi) && macroJson && Array.isArray(macroJson)) {
      try {
        await reportProgress('building_dpf', `Building native ${format.toUpperCase()} plugin with DPF`);
        const macros = macroJson as Parameters<typeof generateDpfWrapper>[3];
        const dpfDir = resolve(workDir, 'dpf_build');
        mkdirSync(dpfDir, { recursive: true });

        if (!dspClassPath) {
          dspClassPath = resolve(workDir, 'HayashiDSP.h');
          await exec('faust', ['-cn', 'HayashiDSP', '-i', dspPath, '-o', dspClassPath], {
            onStdout: (line) => reportLog('info', 'preparing', line, 'faust stdout'),
            onStderr: (line) => reportLog('warn', 'preparing', line, 'faust stderr'),
          });
        }

        const dpfOut = generateDpfWrapper(pluginName, pluginId, version, macros, 2, 2, format, {
          includeUi,
          platform,
        });

        writeFileSync(resolve(dpfDir, 'dpf_plugin.cpp'), dpfOut.pluginSource);
        writeFileSync(resolve(dpfDir, 'dpf_ui.cpp'), dpfOut.uiSource);
        writeFileSync(resolve(dpfDir, 'DistrhoPluginInfo.h'), dpfOut.pluginInfoHeader);
        writeFileSync(resolve(dpfDir, 'Makefile'), dpfOut.makefile);
        copyFileSync(dspClassPath, resolve(dpfDir, 'HayashiDSP.h'));
        if (includeUi && uiSourcePath) {
          copyFileSync(uiSourcePath, resolve(dpfDir, 'plugin_ui.cpp'));
          copyFileSync(resolve(workDir, 'plugin_ui.h'), resolve(dpfDir, 'plugin_ui.h'));
        }

        const binDir = resolve(dpfDir, 'bin');
        // Cap parallelism to avoid CPU thrashing in containers where cpus().length
        // returns the host count rather than the container limit.
        const maxJobs = process.env.EXPORT_BUILD_JOBS
          ? parseInt(process.env.EXPORT_BUILD_JOBS, 10)
          : Math.min(4, Math.max(1, cpus().length));
        await exec('make', ['DPF_PATH=' + dpfPath, '-j', String(maxJobs)], {
          cwd: dpfDir,
          timeoutMs: 600000,
          onStdout: (line) => reportLog('info', 'building_dpf', line, 'make stdout'),
          onStderr: (line) => reportLog('warn', 'building_dpf', line, 'make stderr'),
        });

        await reportLog('info', 'building_dpf', 'DPF make finished; checking for produced plugin artifacts', 'dpf');
        const artifactPath = findDpfArtifactPath(workDir, safePluginName, format);
        if (artifactPath) {
          await reportLog('info', 'building_dpf', `Found built plugin artifact at ${artifactPath}`, 'dpf');
          dpfBuildSucceeded = true;
        } else {
          await reportLog('warn', 'building_dpf', 'DPF make completed but no plugin artifact was found in expected output locations', 'dpf');
          dpfBuildSucceeded = existsSync(binDir);
        }
      } catch (dpfErr) {
        dpfBuildError = dpfErr instanceof Error ? dpfErr : new Error(String(dpfErr));
        const explained = explainNativeBuildFailure(dpfBuildError.message);
        await reportLog('error', 'building_dpf', explained, 'dpf');
        console.warn('[Hayashi] DPF build failed:', explained);
        dpfBuildError = new Error(explained);
      }
    }

    if (!dpfBuildSucceeded) {
      throw new Error(
        dpfBuildError
          ? `DPF ${format.toUpperCase()} build failed: ${dpfBuildError.message}`
          : `DPF ${format.toUpperCase()} build failed before producing a real plugin artifact.`
      );
    }

    // ── Step 2: Package DPF artifact into bundle directory ─────────────
    const dpfArtifactPath = findDpfArtifactPath(workDir, safePluginName, format);
    if (!dpfArtifactPath || !existsSync(dpfArtifactPath)) {
      throw new Error(`DPF ${format.toUpperCase()} build completed but the plugin artifact could not be located for packaging.`);
    }
    const bundleName = basename(dpfArtifactPath) || `${safePluginName}.${format}`;
    const bundleDir = resolve(workDir, bundleName);
    const artifactStat = statSync(dpfArtifactPath);
    const normalizedArtifactPath = resolve(dpfArtifactPath);
    const normalizedBundlePath = resolve(bundleDir);
    if (normalizedArtifactPath !== normalizedBundlePath) {
      if (artifactStat.isDirectory()) {
        cpSync(dpfArtifactPath, bundleDir, { recursive: true });
      } else {
        copyFileSync(dpfArtifactPath, bundleDir);
      }
    }

    // ── Step 3: Archive bundle and upload to Tigris ────────────────────
    await reportProgress('packaging', 'Packaging plugin bundle');
    await reportLog('info', 'packaging', `Creating archive ${bundleName}.tar.gz`, 'tar');
    const archiveFilename = `${safePluginName}.${format}.tar.gz`;
    const archivePath = resolve(workDir, archiveFilename);
    await exec('tar', ['czf', archiveFilename, bundleName], {
      cwd: workDir,
      onStdout: (line) => reportLog('info', 'packaging', line, 'tar stdout'),
      onStderr: (line) => reportLog('warn', 'packaging', line, 'tar stderr'),
    });
    const archiveBuffer = readFileSync(archivePath);
    await reportProgress('uploading', 'Uploading bundle and source artifacts');
    await reportLog('info', 'uploading', `Uploading archive to ${tigrisKey}`, 'upload');
    await uploadAsset(tigrisKey, archiveBuffer, 'application/gzip');

    // ── Step 4: Upload source .dsp to Tigris (dataset preservation) ────
    await reportLog('info', 'uploading', `Uploading source DSP to ${dspKey}`, 'upload');
    await uploadAsset(dspKey, Buffer.from(sourceCode, 'utf-8'), 'text/plain');

    // ── Step 5: Return signed download URL (1 hour) ────────────────────
    const downloadUrl = await getAssetUrl(tigrisKey, 3600, contentDisposition);
    await reportProgress('completed', 'Build completed successfully');
    return { downloadUrl, fromCache: false, filename: archiveFilename };
  } finally {
    try { rmSync(workDir, { recursive: true }); } catch {}
  }
}
