import { describe, it, expect } from 'vitest';
import { parseFaustParams } from './params.js';

describe('parseFaustParams', () => {
  it('parses vslider with unit label', () => {
    const code = `freq = vslider("freq [unit:Hz]", 440, 20, 20000, 1);`;
    const params = parseFaustParams(code);
    expect(params).toHaveLength(1);
    expect(params[0]).toEqual({ name: 'freq', value: 440, min: 20, max: 20000 });
  });

  it('parses hslider', () => {
    const code = `mix = hslider("mix", 0.5, 0, 1, 0.01);`;
    const params = parseFaustParams(code);
    expect(params).toEqual([{ name: 'mix', value: 0.5, min: 0, max: 1 }]);
  });

  it('parses multiple params', () => {
    const code = `
      freq = vslider("freq", 440, 20, 20000, 1);
      gain = hslider("gain [unit:dB]", -6, -60, 0, 1);
    `;
    const params = parseFaustParams(code);
    expect(params).toHaveLength(2);
    expect(params[1].name).toBe('gain');
  });
});
