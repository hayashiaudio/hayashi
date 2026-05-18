import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import pluginSpecSchema from './plugin-spec.schema.json' with { type: 'json' };
import { emitFaustFromSpec, parseAndValidatePluginSpec } from './spec-runtime.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(pluginSpecSchema);

const validEffectSpec = {
  schemaVersion: '1.0',
  kind: 'effect',
  name: 'Echo Space',
  voiceArchitecture: 'custom_graph',
  toneModel: 'lush_spacious',
  macroControls: [],
  io: { inputs: 2, outputs: 2 },
  parameters: [
    { id: 'depth', label: 'Depth', kind: 'slider', init: 0.4, min: 0, max: 1 },
  ],
  graph: {
    source: { type: 'effect' },
    processors: [
      { kind: 'delay', library: 'ef', symbol: 'echo', time: '0.25', feedback: '0.35', maxTime: 2 },
      { kind: 'reverb', library: 're', symbol: 'stereo_freeverb', mix: 'depth' },
    ],
  },
};

describe('plugin spec schema/runtime alignment', () => {
  it('accepts a spec that the runtime can parse', () => {
    expect(validate(validEffectSpec), ajv.errorsText(validate.errors)).toBe(true);
    expect(() => parseAndValidatePluginSpec(JSON.stringify(validEffectSpec), 'effect')).not.toThrow();
  });

  it('rejects legacy processor variants that the runtime does not support', () => {
    const legacyDistortion = {
      ...validEffectSpec,
      graph: {
        ...validEffectSpec.graph,
        processors: [{ kind: 'distortion', library: 've', symbol: 'cubicnl', drive: '0.5' }],
      },
    };
    const legacySpatial = {
      ...validEffectSpec,
      io: { inputs: 1, outputs: 2 },
      graph: {
        ...validEffectSpec.graph,
        processors: [{ kind: 'spatial', library: 'ro', symbol: 'pan2', position: '0.5' }],
      },
    };

    expect(validate(legacyDistortion)).toBe(false);
    expect(validate(legacySpatial)).toBe(false);
  });

  it('rejects kind/source and kind/voiceArchitecture mismatches at schema level', () => {
    const wrongSource = {
      ...validEffectSpec,
      graph: {
        ...validEffectSpec.graph,
        source: {
          type: 'synth',
          oscillators: [{ library: 'os', symbol: 'sawtooth', frequency: '440' }],
          envelope: { library: 'en', symbol: 'adsr' },
        },
      },
    };
    const wrongArchitecture = {
      ...validEffectSpec,
      voiceArchitecture: 'mono_bass',
    };

    expect(validate(wrongSource)).toBe(false);
    expect(validate(wrongArchitecture)).toBe(false);
  });

  it('rejects the legacy percussion exciter shape the runtime cannot emit', () => {
    const legacyPercussion = {
      schemaVersion: '1.0',
      kind: 'percussion',
      name: 'Impact',
      voiceArchitecture: 'custom_graph',
      toneModel: 'dark_ambient',
      macroControls: [],
      io: { inputs: 0, outputs: 1 },
      parameters: [],
      graph: {
        source: {
          type: 'percussion',
          exciter: { library: 'sy', symbol: 'popFilterDrum' },
          envelope: { library: 'en', symbol: 'ar' },
        },
        processors: [],
      },
    };

    expect(validate(legacyPercussion)).toBe(false);
  });

  it('fills required template macros from defaults during runtime normalization', () => {
    const templatedEffect = {
      schemaVersion: '1.0',
      kind: 'effect',
      name: 'Motion Echo',
      voiceArchitecture: 'modulated_echo_verb',
      toneModel: 'tape_vintage',
      macroControls: [],
      io: { inputs: 2, outputs: 2 },
      parameters: [
        { id: 'depth', label: 'Depth', kind: 'slider', init: 0.4, min: 0, max: 1 },
      ],
      graph: {
        source: { type: 'effect' },
        processors: [
          { kind: 'delay', library: 'ef', symbol: 'echo', time: '0.25', feedback: '0.35' },
          { kind: 'reverb', library: 're', symbol: 'stereo_freeverb', mix: 'depth' },
        ],
      },
    };

    expect(validate(templatedEffect), ajv.errorsText(validate.errors)).toBe(true);
    const parsed = parseAndValidatePluginSpec(JSON.stringify(templatedEffect), 'effect');
    expect(parsed.macroControls.some((macro) => macro.id === 'feedbackTone')).toBe(true);
    expect(parsed.macroControls.some((macro) => macro.id === 'space')).toBe(true);
    expect(parsed.macroControls.length).toBeGreaterThanOrEqual(5);
  });

  it('replaces invented template graphs with a canonical graph before validation', () => {
    const templatedEffectWithBadGraph = {
      schemaVersion: '1.0',
      kind: 'effect',
      name: 'Broken Motion Echo',
      voiceArchitecture: 'modulated_echo_verb',
      toneModel: 'tape_vintage',
      macroControls: [],
      io: { inputs: 2, outputs: 2 },
      parameters: [],
      graph: {
        source: { type: 'effect' },
        processors: [
          { kind: 'delay', library: 'ef', symbol: 'echo', time: '0.25', feedback: '0.35' },
          { kind: 'modulation', library: 'pf', symbol: 'chorus', rate: '0.2', depth: '0.4' },
          { kind: 'spatial', library: 'ro', symbol: 'pan2', position: '0.5' },
        ],
      },
    };

    const parsed = parseAndValidatePluginSpec(JSON.stringify(templatedEffectWithBadGraph), 'effect');
    expect(parsed.voiceArchitecture).toBe('modulated_echo_verb');
    expect(parsed.graph.source.type).toBe('effect');
    expect(parsed.graph.processors).toEqual([]);
  });

  it('accepts synth performance and modulation blocks and emits compliant control smoothing', () => {
    const modulatedSynth = {
      schemaVersion: '1.0',
      kind: 'synth',
      name: 'Glide Synth',
      voiceArchitecture: 'custom_graph',
      toneModel: 'analog_warm',
      macroControls: [],
      io: { inputs: 0, outputs: 1 },
      parameters: [
        { id: 'vibrato_rate', label: 'Vibrato Rate', kind: 'slider', init: 5, min: 0.1, max: 10 },
      ],
      modulation: {
        modulators: [
          { id: 'vibrato', kind: 'lfo', shape: 'osc', rate: 'vibrato_rate' },
          { id: 'freq_smooth', kind: 'smoother', input: 'freq' },
        ],
        routes: [
          { sourceId: 'vibrato', targetId: 'freq', depth: 0.02 },
        ],
      },
      graph: {
        source: {
          type: 'synth',
          oscillators: [{ library: 'os', symbol: 'sawtooth', frequency: 'freq' }],
          envelope: { library: 'en', symbol: 'adsr', attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 },
          performance: { portamentoTime: 0.2, portamentoMode: 'always', legato: true, notePriority: 'last' },
        },
        processors: [],
      },
    };

    expect(validate(modulatedSynth), ajv.errorsText(validate.errors)).toBe(true);
    const parsed = parseAndValidatePluginSpec(JSON.stringify(modulatedSynth), 'synth');
    const code = emitFaustFromSpec(parsed);
    expect(code).toContain('freq_perf = freq : si.smoo;');
    expect(code).toContain('vibrato = os.osc(vibrato_rate);');
    expect(code).toContain('freq_mod = freq_perf + (vibrato * 0.02);');
  });

  it('accepts generic faust library processors for wider compliant coverage', () => {
    const genericFaustProcessor = {
      ...validEffectSpec,
      graph: {
        ...validEffectSpec.graph,
        processors: [
          { kind: 'faust', library: 'co', symbol: 'compressor_demo', args: [0.5, 'depth'], channelMode: 'preserve' },
        ],
      },
    };

    expect(validate(genericFaustProcessor), ajv.errorsText(validate.errors)).toBe(true);
    const parsed = parseAndValidatePluginSpec(JSON.stringify(genericFaustProcessor), 'effect');
    const code = emitFaustFromSpec(parsed);
    expect(code).toContain('par(i, 2, co.compressor_demo(0.5, depth))');
  });

  it('emits unary bandpass helpers instead of raw fi.resonbp stages', () => {
    const templatedEq = {
      schemaVersion: '1.0',
      kind: 'effect',
      name: 'Presence EQ',
      voiceArchitecture: 'eq_3band_musical',
      toneModel: 'clean_precise',
      macroControls: [],
      io: { inputs: 2, outputs: 2 },
      parameters: [],
      graph: {
        source: { type: 'effect' },
        processors: [],
      },
    };
    const customBandpass = {
      ...validEffectSpec,
      io: { inputs: 1, outputs: 1 },
      graph: {
        source: { type: 'effect' },
        processors: [{ kind: 'filter', library: 'fi', symbol: 'resonbp', cutoff: '1200', resonance: '0.9' }],
      },
    };

    const templatedCode = emitFaustFromSpec(parseAndValidatePluginSpec(JSON.stringify(templatedEq), 'effect'));
    expect(templatedCode).toContain('bandpassQ(center, q)');
    expect(templatedCode).toContain('bandpassQ(midFreq, midQ)');
    expect(templatedCode).not.toContain('fi.resonbp(');

    const customCode = emitFaustFromSpec(parseAndValidatePluginSpec(JSON.stringify(customBandpass), 'effect'));
    expect(customCode).toContain('bandpassQ(center, q)');
    expect(customCode).toContain('process = _ * input_gain : bandpassQ(1200, 0.9);');
    expect(customCode).not.toContain('fi.resonbp(');
  });
});
