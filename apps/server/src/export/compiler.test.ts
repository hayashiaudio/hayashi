/**
 * Smoke tests for the DSP-to-native compiler.
 * Requires Faust compiler and Tigris S3 credentials to be available.
 * Run with: cd apps/server && npm test -- src/export/compiler.test.ts
 */

import { describe, it, expect } from 'vitest';
import { compileDspToNative } from './compiler.js';

const SIMPLE_OSC = `import("stdfaust.lib");
process = os.osc(440) * 0.5;`;

describe('compileDspToNative', () => {
  it('compiles a simple oscillator to VST3', async () => {
    const result = await compileDspToNative(SIMPLE_OSC, 'TestOsc', `test-id-${Date.now()}`, 'v1', 'vst3-linux-x64');
    expect(result.fromCache).toBe(false);
    expect(result.filename).toContain('vst3-linux-x64');
  });

  it('returns cached result on second call', async () => {
    const pluginId = `cache-test-${Date.now()}`;
    const first = await compileDspToNative(SIMPLE_OSC, 'TestOsc', pluginId, 'v1', 'vst3-linux-x64');
    expect(first.fromCache).toBe(false);
    const second = await compileDspToNative(SIMPLE_OSC, 'TestOsc', pluginId, 'v1', 'vst3-linux-x64');
    expect(second.fromCache).toBe(true);
  });
});
