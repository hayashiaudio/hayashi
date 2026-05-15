import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { uploadAsset, getAssetUrl } from '../storage.js';

export interface CompileResult {
  downloadUrl: string;
  fromCache: boolean;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function exec(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((res, rej) => {
    const proc = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code !== 0) {
        rej(new Error(`Command failed: ${command} ${args.join(' ')}\n${stderr}\n${stdout}`));
      } else {
        res();
      }
    });
    proc.on('error', (err) => rej(err));
  });
}

export async function compileDspToNative(
  sourceCode: string,
  pluginName: string,
  pluginId: string,
  version: string,
  format: 'vst3' | 'clap'
): Promise<CompileResult> {
  const hash = sha256(sourceCode + format);
  const tigrisKey = `plugins/${pluginId}/${version}/plugin.${format}`;
  const dspKey = `plugins/${pluginId}/${version}/source.dsp`;

  // Check Tigris cache — if the compiled binary exists, return a signed URL
  try {
    const cachedUrl = await getAssetUrl(tigrisKey, 3600);
    if (cachedUrl) {
      return { downloadUrl: cachedUrl, fromCache: true };
    }
  } catch {
    // not cached
  }

  const workDir = resolve('/tmp/hayashi/export-work', `${Date.now()}-${hash}`);
  mkdirSync(workDir, { recursive: true });

  const dspPath = resolve(workDir, 'plugin.dsp');
  writeFileSync(dspPath, sourceCode);

  try {
    // Step 1: Faust → C++
    const cppPath = resolve(workDir, 'plugin.cpp');
    const archFile = format === 'vst3' ? 'vst3.cpp' : 'clap.cpp';
    await exec('faust', ['-a', archFile, dspPath, '-o', cppPath]);

    // Step 2: C++ → shared library
    const soPath = resolve(workDir, 'plugin.so');
    await exec('g++', [
      '-shared', '-fPIC', '-O3',
      cppPath,
      '-o', soPath,
      '-I/usr/share/faust',
    ]);

    // Step 3: Package into bundle directory (VST3/CLAP convention)
    const bundleDir = resolve(workDir, `${pluginName}.${format}`);
    mkdirSync(bundleDir, { recursive: true });

    if (format === 'vst3') {
      const contentsDir = resolve(bundleDir, 'Contents', 'x86_64-linux');
      mkdirSync(contentsDir, { recursive: true });
      const binary = readFileSync(soPath);
      writeFileSync(resolve(contentsDir, `${pluginName}.so`), binary);
    } else {
      const binary = readFileSync(soPath);
      writeFileSync(resolve(bundleDir, `${pluginName}.so`), binary);
    }

    // Step 4: Upload compiled binary to Tigris
    const bundleBuffer = Buffer.from(readFileSync(bundleDir));
    await uploadAsset(tigrisKey, bundleBuffer, 'application/octet-stream');

    // Step 5: Upload source .dsp to Tigris (dataset preservation)
    await uploadAsset(dspKey, Buffer.from(sourceCode, 'utf-8'), 'text/plain');

    // Step 6: Return signed download URL (1 hour)
    const downloadUrl = await getAssetUrl(tigrisKey, 3600);
    return { downloadUrl, fromCache: false };
  } finally {
    try { rmSync(workDir, { recursive: true }); } catch {}
  }
}
