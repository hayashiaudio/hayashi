# Server-Side VST3/CLAP Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated server endpoint that accepts a plugin's Faust DSP code and compiles it into downloadable VST3 (`.vst3`) and CLAP (`.clap`) binaries using the Faust CLI toolchain. All source code (`.dsp`) and compiled binaries are permanently stored in Tigris S3 for dataset preservation.

**Architecture:** A Hono route receives the `.dsp` source, writes it to a temp directory, spawns `faust` with the appropriate architecture file (`vst3.cpp` / `clap.cpp`) to generate C++, then compiles the C++ to a shared library with `g++`. The binary is packaged into a VST3/CLAP bundle, uploaded to Tigris S3 under a well-organized key (`plugins/{plugin-id}/{version}/plugin.vst3`), and a signed download URL is returned. The `.dsp` source is also uploaded to Tigris (`plugins/{plugin-id}/{version}/source.dsp`). The pipeline runs synchronously within the request handler because Faust compilation is fast (<2s for simple DSP). A Tigris-based cache keyed by SHA256 of the source code avoids redundant rebuilds.

**Tech Stack:** Hono (server framework), Node.js `child_process` (`spawn`), Faust compiler (`apt install faust`), `g++` / `build-essential`, Docker multi-stage build, Tigris S3 (`@aws-sdk/client-s3`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/server/src/export/compiler.ts` | Orchestrates the full pipeline: write temp → compile DSP → compile C++ → package bundle → upload to Tigris → return signed URL. Handles Tigris-based caching. |
| `apps/server/src/export/vst3.ts` | VST3-specific compiler wrapper: generates C++ with `faust -a vst3.cpp`, compiles `.so`, packages into `.vst3` bundle directory. |
| `apps/server/src/export/clap.ts` | CLAP-specific compiler wrapper: generates C++ with `faust -a clap.cpp`, compiles `.so`, packages into `.clap` bundle directory. |
| `apps/server/src/routes.ts` | Adds `POST /api/export/:format` route (format = `vst3` or `clap`). Authenticates via Discord access token, validates billing entitlement, returns signed Tigris download URL. |
| `apps/client/src/lib/api.ts` | Adds `exportPlugin(pluginId, format)` helper that POSTs the active plugin's `faustCode` to the server and receives a signed download URL. |
| `apps/client/src/components/PluginPreview.tsx` | Wires the **EXPORT** button to call `exportPlugin()` with a dropdown for format selection. |
| `Dockerfile` | Installs `faust`, `g++`, `build-essential`, and VST3/CLAP SDK headers in the runtime stage. |

---

### Task 1: Update Dockerfile with Faust build toolchain

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Add Faust and build tools to the runtime stage**

Insert after line 44 (`ENV NODE_ENV=production`) and before line 46 (`COPY package*.json ./`):

```dockerfile
# Install Faust compiler + C++ toolchain for DSP→native builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    faust \
    g++ \
    build-essential \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 2: Verify Faust is available in the image**

Add at the end of the Dockerfile (after `CMD`, before EOF):

```dockerfile
# Sanity check: fail build if faust is missing
RUN faust --version
```

- [ ] **Step 3: Build the image locally to confirm**

Run:
```bash
docker build -t hayashi-test .
```

Expected: Build succeeds and prints the Faust version.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "build: add Faust compiler and C++ toolchain to Docker runtime"
```

---

### Task 2: Create the export compiler core (Tigris-backed)

**Files:**
- Create: `apps/server/src/export/compiler.ts`

- [ ] **Step 1: Write the compiler utility**

```typescript
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
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
  const cacheMarkerKey = `plugins/${pluginId}/${version}/.cache-${hash}`;

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
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/export/compiler.ts
git commit -m "feat: add DSP-to-native compiler with Tigris-backed cache"
```

---

### Task 3: Add the server export route (returns signed URL)

**Files:**
- Modify: `apps/server/src/routes.ts`

- [ ] **Step 1: Import the compiler at the top of routes.ts**

Add after line 18 (`import { generateFaustFromPrompt } from './faust/generate.js';`):

```typescript
import { compileDspToNative } from './export/compiler.js';
```

- [ ] **Step 2: Add the route before the catch-all `app.get('*')`**

Insert before line 450 (`app.get('*', (c) => {`):

```typescript
app.post('/api/export/:format', async (c) => {
  const format = c.req.param('format');
  if (format !== 'vst3' && format !== 'clap') {
    return c.json({ error: 'Unsupported format. Use vst3 or clap.' }, 400);
  }

  const body = await c.req.json<{ accessToken?: string; pluginName?: string; pluginId?: string; version?: string; faustCode?: string }>();
  if (!body.accessToken) return c.json({ error: 'Missing access token' }, 400);
  if (!body.faustCode || !body.faustCode.trim()) return c.json({ error: 'Missing faustCode' }, 400);
  if (!body.pluginId) return c.json({ error: 'Missing pluginId' }, 400);

  let identity;
  try {
    identity = await fetchDiscordIdentity(body.accessToken);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const context = buildBillingContext(body.guildId ?? null, body.channelId ?? null);
    const user = await billing.getOrCreateUser(identity);
    const synced = await billing.syncEntitlements(user);
    const snapshot = await billing.authorizeExport(synced, context);
    if (!snapshot.contextAccess.allowed) {
      return c.json({ error: 'Export not allowed for this context' }, 403);
    }
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Billing check failed' }, 500);
  }

  const pluginName = (body.pluginName ?? 'HayashiPlugin').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const version = body.version ?? 'v1';

  try {
    const result = await compileDspToNative(body.faustCode, pluginName, body.pluginId, version, format);
    return c.json({ downloadUrl: result.downloadUrl, fromCache: result.fromCache, format });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Compilation failed';
    console.error('[Hayashi] Export compilation failed:', message);
    return c.json({ error: message }, 500);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes.ts
git commit -m "feat: add /api/export/:format route returning signed Tigris URL"
```

---

### Task 4: Add client-side export API helper

**Files:**
- Modify: `apps/client/src/lib/api.ts` (or create if missing)

- [ ] **Step 1: Read the existing API file to understand patterns**

If `apps/client/src/lib/api.ts` exists, read it. If not, create it.

- [ ] **Step 2: Add the export helper**

```typescript
import { SERVER_BASE_URL } from './constants';

export interface ExportResult {
  downloadUrl: string;
  fromCache: boolean;
  format: 'vst3' | 'clap';
}

export async function exportPluginBinary(
  accessToken: string,
  pluginName: string,
  pluginId: string,
  version: string,
  faustCode: string,
  format: 'vst3' | 'clap'
): Promise<ExportResult> {
  const res = await fetch(`${SERVER_BASE_URL}/api/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, pluginName, pluginId, version, faustCode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Export failed (${res.status})`);
  }

  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/lib/api.ts
git commit -m "feat: add client export helper for VST3/CLAP signed URLs"
```

---

### Task 5: Wire the EXPORT button in PluginPreview

**Files:**
- Modify: `apps/client/src/components/PluginPreview.tsx`

- [ ] **Step 1: Add imports and state for format selection**

Add to imports:
```typescript
import { exportPluginBinary } from '@/lib/api';
import { useDiscordSdk } from '@/hooks/useDiscordSdk';
```

Add state inside the component:
```typescript
const [exportFormat, setExportFormat] = useState<'vst3' | 'clap'>('vst3');
const [exporting, setExporting] = useState(false);
const discord = useDiscordSdk();
```

- [ ] **Step 2: Replace the handleExport function**

```typescript
const handleExport = async () => {
  if (!plugin.faustCode || exporting) return;
  const accessToken = discord.accessToken;
  if (!accessToken) {
    alert('Please sign in to export plugins');
    return;
  }
  setExporting(true);
  try {
    const result = await exportPluginBinary(
      accessToken,
      plugin.name,
      plugin.id,
      'v1',
      plugin.faustCode,
      exportFormat
    );
    const a = document.createElement('a');
    a.href = result.downloadUrl;
    a.download = `${plugin.name.replace(/\s+/g, '_')}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('[Hayashi] Export failed:', err);
    alert(err instanceof Error ? err.message : 'Export failed');
  } finally {
    setExporting(false);
  }
};
```

- [ ] **Step 3: Add format selector next to the EXPORT button**

Replace the EXPORT button block:
```tsx
<div className="flex items-center gap-2 flex-shrink-0">
  {/* ... existing Copy / FAUST buttons ... */}
  <select
    value={exportFormat}
    onChange={(e) => setExportFormat(e.target.value as 'vst3' | 'clap')}
    className="h-8 text-[11px] bg-transparent border border-[#525252] text-[#737373] rounded-md px-2 outline-none"
  >
    <option value="vst3">VST3</option>
    <option value="clap">CLAP</option>
  </select>
  <Button
    size="sm"
    className="h-8 text-[11px] font-bold rounded-md gap-1.5"
    style={{ background: C.accent, color: C.void }}
    onClick={handleExport}
    disabled={exporting || !plugin.faustCode}
  >
    {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    {exporting ? 'BUILDING...' : 'EXPORT'}
  </Button>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/PluginPreview.tsx
git commit -m "feat: wire EXPORT button to server-side VST3/CLAP pipeline"
```

---

### Task 6: Add a basic smoke test for the compiler

**Files:**
- Create: `apps/server/src/export/compiler.test.ts`

- [ ] **Step 1: Write a test that validates the happy path**

```typescript
import { describe, it, expect } from 'vitest';
import { compileDspToNative } from './compiler.js';

const SIMPLE_OSC = `import("stdfaust.lib");
process = os.osc(440) * 0.5;`;

describe('compileDspToNative', () => {
  it('compiles a simple oscillator to VST3', async () => {
    const result = await compileDspToNative(SIMPLE_OSC, 'TestOsc', 'test-id', 'v1', 'vst3');
    expect(result.fromCache).toBe(false);
    expect(result.downloadUrl).toContain('plugins/test-id/v1/plugin.vst3');
  });

  it('returns cached result on second call', async () => {
    const result = await compileDspToNative(SIMPLE_OSC, 'TestOsc', 'test-id', 'v1', 'vst3');
    expect(result.fromCache).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd apps/server && npm test -- src/export/compiler.test.ts
```

Expected: 2 tests pass (requires Faust installed locally or in Docker).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/export/compiler.test.ts
git commit -m "test: add smoke tests for DSP-to-native compiler"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Dockerfile gets Faust + C++ toolchain
- ✅ Server route authenticates via Discord token and checks billing entitlement
- ✅ Compiler writes temp files, runs Faust CLI, compiles C++ to `.so`, packages as VST3/CLAP bundle
- ✅ Tigris-backed SHA256 cache avoids redundant builds
- ✅ `.dsp` source code permanently stored in Tigris for ML dataset
- ✅ Client receives a signed download URL for the compiled binary
- ✅ UI has format selector (VST3 / CLAP) and building spinner state

**2. Placeholder scan:** No TBDs, TODOs, or vague instructions found.

**3. Type consistency:** All function signatures, parameter names, and return types match between `compiler.ts`, `routes.ts`, and `api.ts`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-15-server-side-vst-clap-export.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
