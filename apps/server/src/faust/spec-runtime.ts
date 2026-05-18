import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import pluginSpecSchema from './plugin-spec.schema.json' with { type: 'json' };
import { emitTemplateFaust, expectedKindForArchitecture, getTemplateDefinition } from './template-registry.js';

export type PluginKind = 'synth' | 'effect' | 'percussion';
export type VoiceArchitecture =
  | 'mono_bass'
  | 'supersaw_pad'
  | 'velvet_pluck'
  | 'stereo_lead'
  | 'plate_space'
  | 'hall_bloom'
  | 'microshift_widener'
  | 'modulated_echo_verb'
  | 'dark_motion_verb'
  | 'tempo_echo'
  | 'chorus_reverb'
  | 'tape_saturator'
  | 'analog_ladder_filter'
  | 'drive_filter_bus'
  | 'surgical_tone_filter'
  | 'formant_sweeper'
  | 'resonant_motion_filter'
  | 'wah_texture_filter'
  | 'eq_3band_musical'
  | 'eq_5band_parametric'
  | 'eq_tilt_presence'
  | 'eq_resonant_creative'
  | 'impact_hit'
  | 'custom_graph';
export type ToneModel = 'analog_warm' | 'modern_wide' | 'clean_precise' | 'tape_vintage' | 'lush_spacious' | 'dark_ambient';
export type QualityProfile = 'standard' | 'premium';
export type StereoProfile = 'mono' | 'stereo' | 'wide';

export interface MacroControl {
  id:
    | 'brightness'
    | 'movement'
    | 'body'
    | 'space'
    | 'drive'
    | 'character'
    | 'width'
    | 'punch'
    | 'diffusion'
    | 'damping'
    | 'preDelay'
    | 'feedbackTone'
    | 'modDepth'
    | 'modRate'
    | 'bloom'
    | 'ducking'
    | 'resonanceShape'
    | 'sweepRange'
    | 'tracking'
    | 'saturationPre'
    | 'saturationPost'
    | 'notchAmount'
    | 'vowelShift'
    | 'low'
    | 'lowMid'
    | 'mid'
    | 'high'
    | 'presence'
    | 'air'
    | 'trim'
    | 'weight'
    | 'clarity'
    | 'color'
    | 'resonance';
  label: string;
  init: number;
  min: number;
  max: number;
  step?: number;
}

export interface PluginParameter {
  id: string;
  label: string;
  kind: 'slider' | 'nentry' | 'button' | 'checkbox';
  unit?: string;
  init: number;
  min: number;
  max: number;
  step?: number;
}

interface PluginIo {
  inputs: number;
  outputs: number;
}

const BANDPASS_Q_HELPER = 'bandpassQ(center, q) = fi.highpass(2, max(20.0, center / max(1.15, 2.6 - q * 0.45))) : fi.lowpass(2, min(18000.0, center * max(1.15, 2.6 - q * 0.45)));';

interface PerformanceSpec {
  polyphony?: number;
  legato?: boolean;
  portamentoTime?: number;
  portamentoMode?: 'off' | 'always' | 'legato';
  notePriority?: 'last' | 'low' | 'high';
  retrigger?: boolean;
}

interface OscillatorSpec {
  library: 'os';
  symbol: 'osc' | 'sawtooth' | 'square' | 'triangle' | 'lf_sawpos' | 'phasor';
  frequency: string;
  gain?: number;
  detuneSemitones?: number;
}

interface NoiseLayerSpec {
  library: 'no';
  symbol: 'noise' | 'pink_noise' | 'brown_noise';
  gain?: number;
}

interface EnvelopeSpec {
  library: 'en';
  symbol: 'adsr' | 'ar' | 'asr';
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

interface SynthSourceSpec {
  type: 'synth';
  oscillators: OscillatorSpec[];
  noise?: NoiseLayerSpec;
  envelope: EnvelopeSpec;
  performance?: PerformanceSpec;
}

interface PercussionSourceSpec {
  type: 'percussion';
  exciter: NoiseLayerSpec | OscillatorSpec;
  envelope: EnvelopeSpec;
  performance?: PerformanceSpec;
}

interface EffectSourceSpec {
  type: 'effect';
}

interface FilterProcessor {
  kind: 'filter';
  library: 'fi';
  symbol: 'lowpass' | 'highpass' | 'resonlp' | 'resonbp';
  cutoff?: string;
  resonance?: string;
}

interface DelayProcessor {
  kind: 'delay';
  library: 'ef';
  symbol: 'echo';
  time?: string;
  feedback?: string;
  maxTime?: number;
}

interface ReverbProcessor {
  kind: 'reverb';
  library: 're';
  symbol: 'mono_freeverb' | 'stereo_freeverb';
  mix?: string;
}

interface DistortionProcessor {
  kind: 'distortion';
  library: 'ef';
  symbol: 'cubicnl' | 'softclipQuadratic' | 'wavefold';
  drive?: string;
}

interface SpatialProcessor {
  kind: 'spatial';
  library: 'sp';
  symbol: 'panner';
  position?: string;
}

interface FaustLibraryProcessor {
  kind: 'faust';
  library: 'fi' | 'ef' | 're' | 'sp' | 'co' | 'en' | 'ma' | 'mo' | 'si' | 'ba' | 'os' | 'de' | 'no' | 'la';
  symbol: string;
  args?: Array<string | number | boolean>;
  channelMode?: 'preserve' | 'mono_to_stereo' | 'stereo_only';
}

interface LfoModulatorSpec {
  id: string;
  kind: 'lfo';
  shape: 'osc' | 'sawtooth' | 'square' | 'triangle' | 'lf_sawpos' | 'phasor';
  rate: string;
}

interface SmootherModulatorSpec {
  id: string;
  kind: 'smoother';
  input: string;
}

type ModulatorSpec = LfoModulatorSpec | SmootherModulatorSpec;

interface ModulationRouteSpec {
  sourceId: string;
  targetId: string;
  depth: number;
}

interface ModulationSpec {
  modulators: ModulatorSpec[];
  routes: ModulationRouteSpec[];
}

type SupportedProcessor =
  | FilterProcessor
  | DelayProcessor
  | ReverbProcessor
  | DistortionProcessor
  | SpatialProcessor
  | FaustLibraryProcessor;

export interface PluginSpec {
  schemaVersion: '1.0';
  kind: PluginKind;
  name: string;
  description?: string;
  voiceArchitecture: VoiceArchitecture;
  toneModel: ToneModel;
  qualityProfile?: QualityProfile;
  stereoProfile?: StereoProfile;
  macroControls: MacroControl[];
  io: PluginIo;
  parameters: PluginParameter[];
  modulation?: ModulationSpec;
  graph: {
    source: SynthSourceSpec | PercussionSourceSpec | EffectSourceSpec;
    processors: SupportedProcessor[];
  };
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(pluginSpecSchema);
const IDENTIFIER_RE = /^[a-z][a-zA-Z0-9_]{0,31}$/;
const NUMERIC_LITERAL_RE = /^-?\d+(\.\d+)?$/;

function fail(message: string): never {
  throw new Error(`Invalid Faust plugin spec: ${message}`);
}

function ensureIdentifier(value: string, field: string) {
  if (!IDENTIFIER_RE.test(value)) {
    fail(`${field} must be a valid identifier`);
  }
}

function ensureNumericRange(value: number, field: string, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(`${field} must be between ${min} and ${max}`);
  }
}

function ensureExpression(expr: string | undefined, field: string, allowedIds: Set<string>) {
  if (!expr) return;
  const trimmed = expr.trim();
  if (NUMERIC_LITERAL_RE.test(trimmed)) return;
  if (!allowedIds.has(trimmed)) {
    fail(`${field} must reference a known parameter or numeric literal`);
  }
}

function ensureFaustSymbol(value: string, field: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    fail(`${field} must be a valid Faust identifier`);
  }
}

function normalizeProcessor(proc: Record<string, unknown>, allowedIds: Set<string>): SupportedProcessor {
  if (proc.kind === 'filter' && proc.library === 'fi' && typeof proc.symbol === 'string') {
    if (!['lowpass', 'highpass', 'resonlp', 'resonbp'].includes(proc.symbol)) {
      fail(`unsupported filter symbol: ${String(proc.symbol)}`);
    }
    ensureExpression(typeof proc.cutoff === 'string' ? proc.cutoff : undefined, 'filter.cutoff', allowedIds);
    ensureExpression(typeof proc.resonance === 'string' ? proc.resonance : undefined, 'filter.resonance', allowedIds);
    return proc as unknown as FilterProcessor;
  }

  if (proc.kind === 'delay' && proc.library === 'ef' && proc.symbol === 'echo') {
    ensureExpression(typeof proc.time === 'string' ? proc.time : undefined, 'delay.time', allowedIds);
    ensureExpression(typeof proc.feedback === 'string' ? proc.feedback : undefined, 'delay.feedback', allowedIds);
    if (proc.maxTime !== undefined) ensureNumericRange(Number(proc.maxTime), 'delay.maxTime', 0.01, 8);
    return proc as unknown as DelayProcessor;
  }

  if (proc.kind === 'reverb' && proc.library === 're' && typeof proc.symbol === 'string') {
    if (!['mono_freeverb', 'stereo_freeverb'].includes(proc.symbol)) {
      fail(`unsupported reverb symbol: ${String(proc.symbol)}`);
    }
    ensureExpression(typeof proc.mix === 'string' ? proc.mix : undefined, 'reverb.mix', allowedIds);
    return proc as unknown as ReverbProcessor;
  }

  if (proc.kind === 'distortion' && proc.library === 'ef' && typeof proc.symbol === 'string') {
    if (!['cubicnl', 'softclipQuadratic', 'wavefold'].includes(proc.symbol)) {
      fail(`unsupported distortion symbol: ${String(proc.symbol)}`);
    }
    ensureExpression(typeof proc.drive === 'string' ? proc.drive : undefined, 'distortion.drive', allowedIds);
    return proc as unknown as DistortionProcessor;
  }

  if (proc.kind === 'spatial' && proc.library === 'sp' && proc.symbol === 'panner') {
    ensureExpression(typeof proc.position === 'string' ? proc.position : undefined, 'spatial.position', allowedIds);
    return proc as unknown as SpatialProcessor;
  }

  if (proc.kind === 'faust' && typeof proc.library === 'string' && typeof proc.symbol === 'string') {
    ensureFaustSymbol(proc.symbol, 'faust.symbol');
    if (Array.isArray(proc.args)) {
      proc.args.forEach((arg, index) => {
        if (typeof arg === 'string') {
          ensureExpression(arg, `faust.args[${index}]`, allowedIds);
        }
      });
    }
    return proc as unknown as FaustLibraryProcessor;
  }

  fail(`unsupported processor: ${JSON.stringify(proc)}`);
}

function normalizeEnvelope(envelope: EnvelopeSpec, triggerId: string): string {
  const attack = envelope.attack ?? 0.01;
  const decay = envelope.decay ?? 0.2;
  const sustain = envelope.sustain ?? 0.6;
  const release = envelope.release ?? 0.2;

  if (envelope.symbol === 'adsr') {
    return `en.adsr(${attack}, ${decay}, ${sustain}, ${release}, ${triggerId})`;
  }
  if (envelope.symbol === 'asr') {
    return `en.asr(${attack}, ${sustain}, ${release}, ${triggerId})`;
  }
  return `en.ar(${attack}, ${release}, ${triggerId})`;
}

function expr(value: string | undefined, fallback: string, allowedIds: Set<string>, aliases?: Map<string, string>): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (NUMERIC_LITERAL_RE.test(trimmed)) return trimmed;
  if (aliases?.has(trimmed)) return aliases.get(trimmed)!;
  if (allowedIds.has(trimmed)) return trimmed;
  fail(`unknown expression token: ${trimmed}`);
}

function emitUiParameter(param: PluginParameter): string {
  const label = param.unit ? `${param.label} [${param.unit}]` : param.label;
  if (param.kind === 'button') return `${param.id} = button("${label}")`;
  if (param.kind === 'checkbox') return `${param.id} = checkbox("${label}")`;
  if (param.kind === 'nentry') return `${param.id} = nentry("${label}", ${param.init}, ${param.min}, ${param.max}, ${param.step ?? 0.01})`;
  return `${param.id} = hslider("${label}", ${param.init}, ${param.min}, ${param.max}, ${param.step ?? 0.01})`;
}

function emitCoreParameters(kind: PluginKind): string[] {
  if (kind === 'effect') {
    return [
      'mix = hslider("mix", 0.5, 0, 1, 0.01)',
      'input_gain = hslider("input gain", 1.0, 0, 2, 0.01)',
    ];
  }
  if (kind === 'percussion') {
    return [
      'freq = hslider("freq [Hz]", 180, 20, 4000, 1)',
      'gain = hslider("gain", 0.8, 0, 1, 0.01)',
      'trigger = button("trigger")',
    ];
  }
  return [
    'freq = hslider("freq [Hz]", 440, 20, 4000, 1)',
    'gain = hslider("gain", 0.8, 0, 1, 0.01)',
    'gate = button("gate")',
  ];
}

function emitOscillator(osc: OscillatorSpec, allowedIds: Set<string>, aliases?: Map<string, string>): string {
  const freqExpr = expr(osc.frequency, 'freq', allowedIds, aliases);
  const ratio = osc.detuneSemitones ? ` * ${Math.pow(2, osc.detuneSemitones / 12).toFixed(6)}` : '';
  const gain = osc.gain ?? 1;
  return `(os.${osc.symbol}(${freqExpr}${ratio}) * ${gain})`;
}

function emitNoise(noise: NoiseLayerSpec): string {
  return `(no.${noise.symbol} * ${noise.gain ?? 0.2})`;
}

function emitSource(spec: PluginSpec, allowedIds: Set<string>, aliases?: Map<string, string>): string {
  if (spec.graph.source.type === 'effect') {
    const inputGainExpr = aliases?.get('input_gain') ?? 'input_gain';
    return spec.io.inputs === 2 ? `_,_ : *(${inputGainExpr}),*(${inputGainExpr})` : `_ * ${inputGainExpr}`;
  }

  if (spec.graph.source.type === 'percussion') {
    const exciter = spec.graph.source.exciter.library === 'os'
      ? emitOscillator(spec.graph.source.exciter, allowedIds, aliases)
      : emitNoise(spec.graph.source.exciter);
    const env = normalizeEnvelope(spec.graph.source.envelope, 'trigger');
    return `((${exciter}) * ${env} * gain)`;
  }

  const layers = spec.graph.source.oscillators.map((osc) => emitOscillator(osc, allowedIds, aliases));
  if (spec.graph.source.noise) {
    layers.push(emitNoise(spec.graph.source.noise));
  }
  const mixed = layers.length === 1 ? layers[0] : `((${layers.join(' + ')}) / ${layers.length})`;
  const env = normalizeEnvelope(spec.graph.source.envelope, 'gate');
  return `((${mixed}) * ${env} * gain)`;
}

function emitProcessor(
  processor: SupportedProcessor,
  allowedIds: Set<string>,
  channels: number,
  aliases?: Map<string, string>,
): { code: string; channels: number } {
  const wrap = (inner: string) => channels === 2 ? `par(i, 2, ${inner})` : inner;

  switch (processor.kind) {
    case 'filter': {
      const cutoff = expr(processor.cutoff, '1000', allowedIds, aliases);
      const resonance = expr(processor.resonance, '0.7', allowedIds, aliases);
      if (processor.symbol === 'lowpass') return { code: wrap(`fi.lowpass(4, ${cutoff})`), channels };
      if (processor.symbol === 'highpass') return { code: wrap(`fi.highpass(4, ${cutoff})`), channels };
      if (processor.symbol === 'resonlp') return { code: wrap(`fi.resonlp(${cutoff}, ${resonance})`), channels };
      return { code: wrap(`bandpassQ(${cutoff}, ${resonance})`), channels };
    }
    case 'delay': {
      const maxTime = processor.maxTime ?? 2;
      const time = expr(processor.time, '0.25', allowedIds, aliases);
      const feedback = expr(processor.feedback, '0.3', allowedIds, aliases);
      return { code: wrap(`ef.echo(${maxTime}, ${time}, ${feedback})`), channels };
    }
    case 'reverb': {
      const mix = expr(processor.mix, '0.35', allowedIds, aliases);
      if (processor.symbol === 'stereo_freeverb') {
        if (channels !== 2) {
          fail('stereo_freeverb requires a stereo signal before the reverb stage');
        }
        return { code: `re.stereo_freeverb(${mix})`, channels: 2 };
      }
      return { code: wrap(`re.mono_freeverb(${mix})`), channels };
    }
    case 'distortion': {
      const drive = expr(processor.drive, '0.8', allowedIds, aliases);
      return { code: wrap(`ef.${processor.symbol}(${drive})`), channels };
    }
    case 'spatial': {
      if (channels !== 1) {
        fail('panner can only be applied to a mono signal');
      }
      const position = expr(processor.position, '0.5', allowedIds, aliases);
      return { code: `sp.panner(${position})`, channels: 2 };
    }
    case 'faust': {
      const channelMode = processor.channelMode ?? 'preserve';
      const args = (processor.args ?? [])
        .map((arg) => {
          if (typeof arg === 'string') return expr(arg, arg, allowedIds, aliases);
          if (typeof arg === 'boolean') return arg ? '1' : '0';
          return String(arg);
        })
        .join(', ');
      const call = `${processor.library}.${processor.symbol}(${args})`;

      if (channelMode === 'preserve') {
        return { code: wrap(call), channels };
      }
      if (channelMode === 'mono_to_stereo') {
        if (channels !== 1) fail(`faust processor ${processor.library}.${processor.symbol} requires mono input`);
        return { code: call, channels: 2 };
      }
      if (channels !== 2) fail(`faust processor ${processor.library}.${processor.symbol} requires stereo input`);
      return { code: call, channels: 2 };
    }
  }
}

function buildModulationPrelude(
  spec: PluginSpec,
  allowedIds: Set<string>,
  baseAliases?: Map<string, string>,
): { lines: string[]; aliases: Map<string, string> } {
  const lines: string[] = [];
  const aliases = new Map<string, string>();
  const modulation = spec.modulation;
  if (!modulation) {
    return { lines, aliases };
  }

  for (const modulator of modulation.modulators) {
    ensureIdentifier(modulator.id, `modulator.${modulator.id}`);
    if (modulator.kind === 'lfo') {
      lines.push(`${modulator.id} = os.${modulator.shape}(${expr(modulator.rate, '0.5', allowedIds, baseAliases ?? aliases)});`);
      continue;
    }
    lines.push(`${modulator.id} = ${expr(modulator.input, '0', allowedIds, baseAliases ?? aliases)} : si.smoo;`);
  }

  const routesByTarget = new Map<string, string[]>();
  for (const route of modulation.routes) {
    if (!allowedIds.has(route.targetId)) {
      fail(`modulation route target must reference a known parameter: ${route.targetId}`);
    }
    const contributions = routesByTarget.get(route.targetId) ?? [];
    contributions.push(`(${route.sourceId} * ${route.depth})`);
    routesByTarget.set(route.targetId, contributions);
  }

  for (const [targetId, contributions] of routesByTarget.entries()) {
    const alias = `${targetId}_mod`;
    const baseTarget = baseAliases?.get(targetId) ?? targetId;
    lines.push(`${alias} = ${baseTarget} + ${contributions.join(' + ')};`);
    aliases.set(targetId, alias);
  }

  return { lines, aliases };
}

function buildPerformancePrelude(spec: PluginSpec): { lines: string[]; aliases: Map<string, string> } {
  const lines: string[] = [];
  const aliases = new Map<string, string>();
  const performance = spec.graph.source.type === 'synth' || spec.graph.source.type === 'percussion'
    ? spec.graph.source.performance
    : undefined;

  if (!performance) {
    return { lines, aliases };
  }

  if ((performance.portamentoTime ?? 0) > 0 && spec.kind === 'synth') {
    lines.push('freq_perf = freq : si.smoo;');
    aliases.set('freq', 'freq_perf');
  }

  return { lines, aliases };
}

function sanitizePositiveStep(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function canonicalGraphForKind(kind: PluginKind): PluginSpec['graph'] {
  if (kind === 'effect') {
    return {
      source: { type: 'effect' },
      processors: [],
    };
  }

  if (kind === 'percussion') {
    return {
      source: {
        type: 'percussion',
        exciter: {
          library: 'no',
          symbol: 'pink_noise',
          gain: 0.4,
        },
        envelope: {
          library: 'en',
          symbol: 'ar',
          attack: 0.001,
          release: 0.2,
        },
      },
      processors: [],
    };
  }

  return {
    source: {
      type: 'synth',
      oscillators: [
        {
          library: 'os',
          symbol: 'sawtooth',
          frequency: 'freq',
          gain: 1,
        },
      ],
      envelope: {
        library: 'en',
        symbol: 'adsr',
        attack: 0.01,
        decay: 0.2,
        sustain: 0.6,
        release: 0.2,
      },
    },
    processors: [],
  };
}

function normalizeTemplateDefaults(spec: Record<string, unknown>): Record<string, unknown> {
  const voiceArchitecture = typeof spec.voiceArchitecture === 'string' ? spec.voiceArchitecture : null;
  if (!voiceArchitecture) return spec;

  const template = getTemplateDefinition(voiceArchitecture as VoiceArchitecture);
  if (!template) return spec;

  const macroControls = Array.isArray(spec.macroControls)
    ? spec.macroControls.filter((macro) => macro && typeof macro === 'object').map((macro) => ({ ...(macro as Record<string, unknown>) }))
    : [];
  const macroIds = new Set(
    macroControls
      .map((macro) => (typeof macro.id === 'string' ? macro.id : null))
      .filter((id): id is string => Boolean(id))
  );

  for (const requiredMacro of template.requiredMacros) {
    if (macroIds.has(requiredMacro)) continue;
    const fallback = template.defaults.macros.find((macro) => macro.id === requiredMacro);
    if (!fallback) continue;
    macroControls.push({
      id: fallback.id,
      label: fallback.label,
      init: fallback.init,
      min: 0,
      max: 1,
      step: 0.01,
    });
  }

  const toneModel = typeof spec.toneModel === 'string' ? spec.toneModel : null;
  const qualityProfile = typeof spec.qualityProfile === 'string' ? spec.qualityProfile : null;
  const stereoProfile = typeof spec.stereoProfile === 'string' ? spec.stereoProfile : null;
  const kind = typeof spec.kind === 'string' ? spec.kind as PluginKind : expectedKindForArchitecture(voiceArchitecture as VoiceArchitecture);

  return {
    ...spec,
    toneModel: toneModel && template.allowedToneModels.includes(toneModel as ToneModel)
      ? toneModel
      : template.defaults.toneModel,
    qualityProfile: qualityProfile && template.allowedQualityProfiles.includes(qualityProfile as QualityProfile)
      ? qualityProfile
      : template.defaultQualityProfile,
    stereoProfile: stereoProfile && template.allowedStereoProfiles.includes(stereoProfile as StereoProfile)
      ? stereoProfile
      : template.defaultStereoProfile,
    graph: canonicalGraphForKind(kind),
    macroControls,
  };
}

function sanitizeParsedPluginSpec(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;

  const spec = raw as Record<string, unknown>;
  const graph = spec.graph && typeof spec.graph === 'object'
    ? spec.graph as Record<string, unknown>
    : null;
  const processors = Array.isArray(graph?.processors)
    ? graph!.processors.map((processor) => {
        if (!processor || typeof processor !== 'object') return processor;
        const next = { ...(processor as Record<string, unknown>) };
        if (next.kind === 'reverb' && next.library === 're') {
          if (next.symbol === 'freeverb_demo') {
            next.symbol = 'stereo_freeverb';
          } else if (next.symbol === 'jcrev') {
            next.symbol = 'mono_freeverb';
          } else if (next.symbol === 'zita_rev1_stereo' || next.symbol === 'greyhole') {
            next.symbol = 'stereo_freeverb';
          }
        }
        return next;
      })
    : graph?.processors;
  const parameters = Array.isArray(spec.parameters)
    ? spec.parameters.map((param) => {
        if (!param || typeof param !== 'object') return param;
        const next = { ...(param as Record<string, unknown>) };
        const step = sanitizePositiveStep(next.step);
        if (step === undefined) {
          delete next.step;
        } else {
          next.step = step;
        }
        return next;
      })
    : spec.parameters;

  const macroControls = Array.isArray(spec.macroControls)
    ? spec.macroControls.map((macro) => {
        if (!macro || typeof macro !== 'object') return macro;
        const next = { ...(macro as Record<string, unknown>) };
        const step = sanitizePositiveStep(next.step);
        if (step === undefined) {
          delete next.step;
        } else {
          next.step = step;
        }
        return next;
      })
    : spec.macroControls;

  return normalizeTemplateDefaults({
    ...spec,
    graph: graph ? {
      ...graph,
      processors,
    } : spec.graph,
    parameters,
    macroControls,
  });
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'unknown schema validation error';

  const summarized = new Set<string>();
  for (const error of errors) {
    const path = error.instancePath || '/';

    if (path.startsWith('/graph/processors/') && error.keyword === 'oneOf') {
      summarized.add(
        `${path} must be one supported processor shape: filter/fi/{lowpass|highpass|resonlp|resonbp}, delay/ef/echo, reverb/re/{mono_freeverb|stereo_freeverb}, distortion/ef/{cubicnl|softclipQuadratic|wavefold}, spatial/sp/panner, or faust/<library>/<symbol>`
      );
      continue;
    }

    if (path.startsWith('/graph/processors/') && ['const', 'enum', 'additionalProperties'].includes(error.keyword)) {
      continue;
    }

    summarized.add(`${path} ${error.message ?? 'is invalid'}`);
  }

  return summarized.size > 0
    ? Array.from(summarized).join('; ')
    : errors.map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('; ');
}

export function parseAndValidatePluginSpec(raw: string, expectedKind?: PluginKind): PluginSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid Faust plugin spec: response was not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }

  const sanitized = sanitizeParsedPluginSpec(parsed);

  if (!validateSchema(sanitized)) {
    const detail = formatSchemaErrors(validateSchema.errors ?? []);
    throw new Error(`Invalid Faust plugin spec: ${detail}`);
  }

  const spec = sanitized as unknown as PluginSpec;
  if (expectedKind && spec.kind !== expectedKind) {
    fail(`kind must be ${expectedKind}`);
  }
  if (expectedKindForArchitecture(spec.voiceArchitecture) !== spec.kind && spec.voiceArchitecture !== 'custom_graph') {
    fail(`voiceArchitecture ${spec.voiceArchitecture} is not valid for kind ${spec.kind}`);
  }
  if (spec.graph.source.type !== spec.kind && !(spec.kind === 'effect' && spec.graph.source.type === 'effect')) {
    fail('graph.source.type must match kind');
  }
  const macroIds = new Set<string>();
  for (const macro of spec.macroControls) {
    ensureIdentifier(macro.id, `macro.${macro.label}`);
    if (macroIds.has(macro.id)) fail(`duplicate macro control id: ${macro.id}`);
    macroIds.add(macro.id);
    if (macro.min > macro.max) fail(`macro ${macro.id} has min greater than max`);
    if (macro.init < macro.min || macro.init > macro.max) fail(`macro ${macro.id} init must be within its range`);
  }

  const template = getTemplateDefinition(spec.voiceArchitecture);
  if (template) {
    if (!template.supportedKinds.includes(spec.kind)) {
      fail(`template ${template.id} does not support kind ${spec.kind}`);
    }
    if (!template.allowedToneModels.includes(spec.toneModel)) {
      fail(`template ${template.id} does not allow toneModel ${spec.toneModel}`);
    }
    const stereoProfile = spec.stereoProfile ?? template.defaultStereoProfile;
    if (!template.allowedStereoProfiles.includes(stereoProfile)) {
      fail(`template ${template.id} does not allow stereoProfile ${stereoProfile}`);
    }
    const qualityProfile = spec.qualityProfile ?? template.defaultQualityProfile;
    if (!template.allowedQualityProfiles.includes(qualityProfile)) {
      fail(`template ${template.id} does not allow qualityProfile ${qualityProfile}`);
    }
    for (const requiredMacro of template.requiredMacros) {
      if (!macroIds.has(requiredMacro)) {
        fail(`template ${template.id} requires macroControl ${requiredMacro}`);
      }
    }
  }

  const ids = new Set<string>();
  for (const param of spec.parameters) {
    ensureIdentifier(param.id, `parameter.${param.label}`);
    if (ids.has(param.id)) fail(`duplicate parameter id: ${param.id}`);
    ids.add(param.id);
    if (param.min > param.max) fail(`parameter ${param.id} has min greater than max`);
    if (param.init < param.min || param.init > param.max) fail(`parameter ${param.id} init must be within its range`);
  }

  const allowedIds = new Set<string>([...ids]);
  if (spec.kind === 'effect') {
    allowedIds.add('mix');
    allowedIds.add('input_gain');
  } else if (spec.kind === 'percussion') {
    allowedIds.add('freq');
    allowedIds.add('gain');
    allowedIds.add('trigger');
  } else {
    allowedIds.add('freq');
    allowedIds.add('gain');
    allowedIds.add('gate');
  }

  if (spec.graph.source.type === 'synth') {
    spec.graph.source.oscillators.forEach((osc, index) => {
      ensureExpression(osc.frequency, `oscillators[${index}].frequency`, allowedIds);
    });
  } else if (spec.graph.source.type === 'percussion') {
    if (spec.graph.source.exciter.library === 'os') {
      ensureExpression(spec.graph.source.exciter.frequency, 'percussion.exciter.frequency', allowedIds);
    }
  }

  if (spec.modulation) {
    const modulatorIds = new Set<string>();
    for (const modulator of spec.modulation.modulators) {
      ensureIdentifier(modulator.id, `modulator.${modulator.id}`);
      if (modulatorIds.has(modulator.id)) fail(`duplicate modulator id: ${modulator.id}`);
      modulatorIds.add(modulator.id);
      if (modulator.kind === 'lfo') {
        ensureExpression(modulator.rate, `modulator.${modulator.id}.rate`, allowedIds);
      } else {
        ensureExpression(modulator.input, `modulator.${modulator.id}.input`, allowedIds);
      }
    }
    for (const route of spec.modulation.routes) {
      if (!modulatorIds.has(route.sourceId)) {
        fail(`modulation route source must reference a known modulator: ${route.sourceId}`);
      }
      if (!allowedIds.has(route.targetId)) {
        fail(`modulation route target must reference a known parameter: ${route.targetId}`);
      }
    }
  }

  spec.graph.processors = spec.graph.processors.map((proc) => normalizeProcessor(proc as unknown as Record<string, unknown>, allowedIds));
  return spec;
}

export function emitFaustFromSpec(spec: PluginSpec): string {
  const templated = emitTemplateFaust(spec);
  if (templated) {
    return templated;
  }

  const extraParamLines = spec.parameters.map(emitUiParameter);
  const coreParamLines = emitCoreParameters(spec.kind);
  const allowedIds = new Set<string>([
    ...spec.parameters.map((param) => param.id),
    ...(spec.kind === 'effect'
      ? ['mix', 'input_gain']
      : spec.kind === 'percussion'
        ? ['freq', 'gain', 'trigger']
        : ['freq', 'gain', 'gate']),
  ]);
  const performancePrelude = buildPerformancePrelude(spec);
  const modulationPrelude = buildModulationPrelude(spec, allowedIds, performancePrelude.aliases);
  const aliases = new Map<string, string>([
    ...performancePrelude.aliases.entries(),
    ...modulationPrelude.aliases.entries(),
  ]);

  const stages: string[] = [emitSource(spec, allowedIds, aliases)];
  let channels = spec.kind === 'effect' ? spec.io.inputs : 1;
  for (const processor of spec.graph.processors) {
    const stage = emitProcessor(processor, allowedIds, channels, aliases);
    stages.push(stage.code);
    channels = stage.channels;
  }

  if (spec.io.outputs === 2 && channels === 1) {
    stages.push('sp.panner(0.5)');
    channels = 2;
  }
  if (spec.io.outputs === 1 && channels !== 1) {
    fail('spec requests mono output but processor chain produces stereo output');
  }

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    ...coreParamLines.map((line) => `${line};`),
    ...extraParamLines.map((line) => `${line};`),
    ...performancePrelude.lines,
    ...modulationPrelude.lines,
    `process = ${stages.join(' : ')};`,
  ].join('\n');
}
