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
