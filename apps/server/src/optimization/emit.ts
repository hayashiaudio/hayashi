import {
  emitFaustFromSpec,
  parseAndValidatePluginSpec,
  type MacroControl,
  type PluginParameter,
  type PluginSpec,
  type ToneModel,
  type VoiceArchitecture,
} from '../faust/spec-runtime.js';
import { getOptimizationArchitecture } from './category-registry.js';
import type {
  DelayEchoArchitectureId,
  NormalizedGeneratedArtifacts,
  OptimizationArchitectureId,
  OptimizationCandidateResult,
  OptimizationTargetVector,
  ReverbSpaceArchitectureId,
  SynthArchitectureId,
} from './contracts.js';
import { normalizeOptimizationArtifacts } from './normalize.js';
import { buildDelayEchoUiScheme, buildParametricEqUiScheme, buildReverbUiScheme, buildSynthUiScheme } from './ui/schemes.js';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function buildUiSpecFromPlannedScheme(scheme: ReturnType<typeof buildParametricEqUiScheme> | ReturnType<typeof buildSynthUiScheme>) {
  return {
    schemaVersion: '1.0' as const,
    uiFamily: scheme.uiFamily,
    uiStyle: scheme.uiStyle,
    title: scheme.title,
    subtitle: scheme.subtitle,
    heroControls: scheme.heroControls as MacroControl['id'][],
    sections: scheme.sections.map((section) => ({
      ...section,
      controls: section.controls as MacroControl['id'][],
    })),
    visualizers: scheme.visualizers,
    meters: scheme.meters,
    layoutHints: scheme.layoutHints,
    themeTokens: scheme.themeTokens,
  };
}

function pickToneModel(architectureId: OptimizationArchitectureId): ToneModel {
  switch (architectureId) {
    case 'eq_5band_parametric':
      return 'clean_precise';
    case 'eq_tilt_presence':
      return 'analog_warm';
    case 'eq_resonant_creative':
      return 'modern_wide';
    case 'mono_bass':
      return 'analog_warm';
    case 'supersaw_pad':
      return 'lush_spacious';
    case 'velvet_pluck':
      return 'clean_precise';
    case 'stereo_lead':
      return 'modern_wide';
    case 'plate_space':
      return 'lush_spacious';
    case 'hall_bloom':
      return 'lush_spacious';
    case 'modulated_echo_verb':
      return 'tape_vintage';
    case 'dark_motion_verb':
      return 'dark_ambient';
    case 'tempo_echo':
      return 'tape_vintage';
    case 'modulated_echo_delay':
      return 'tape_vintage';
    case 'eq_3band_musical':
    default:
      return 'analog_warm';
  }
}

function baseNameForArchitecture(architectureId: OptimizationArchitectureId): string {
  switch (architectureId) {
    case 'eq_3band_musical':
      return 'Musical Tone EQ';
    case 'eq_5band_parametric':
      return 'Parametric Studio EQ';
    case 'eq_tilt_presence':
      return 'Tilt Presence EQ';
    case 'eq_resonant_creative':
      return 'Resonant Color EQ';
    case 'mono_bass':
      return 'Glide Bass Synth';
    case 'supersaw_pad':
      return 'Supersaw Atmos Pad';
    case 'velvet_pluck':
      return 'Velvet Pluck';
    case 'stereo_lead':
      return 'Stereo Lead';
    case 'plate_space':
      return 'Plate Space';
    case 'hall_bloom':
      return 'Hall Bloom';
    case 'modulated_echo_verb':
      return 'Modulated Echo Verb';
    case 'dark_motion_verb':
      return 'Dark Motion Verb';
    case 'tempo_echo':
      return 'Tempo Echo';
    case 'modulated_echo_delay':
      return 'Modulated Echo Delay';
  }
}

function deriveEqMacros(
  architectureId: OptimizationArchitectureId,
  target: OptimizationTargetVector,
  candidateParams: Record<string, number>,
): MacroControl[] {
  const values = target.values;

  const make = (id: MacroControl['id'], label: string, init: number): MacroControl => ({
    id,
    label,
    init: clamp01(init),
    min: 0,
    max: 1,
    step: 0.01,
  });

  switch (architectureId) {
    case 'eq_3band_musical':
      return [
        make('low', 'low', clamp01((((candidateParams.low_gain_db ?? 0) + 12) / 24) * 0.7 + values.weight * 0.3)),
        make('mid', 'mid', clamp01((((candidateParams.mid_gain_db ?? 0) + 12) / 24) * 0.75 + values.clarity * 0.25)),
        make('high', 'high', clamp01((((candidateParams.high_gain_db ?? 0) + 12) / 24) * 0.75 + values.air * 0.25)),
        make('presence', 'presence', clamp01((((candidateParams.mid_freq_hz ?? 1200) - 250) / 4750) * 0.55 + values.forwardness * 0.45)),
        make('trim', 'trim', clamp01(((candidateParams.trim_db ?? 0) + 6) / 12)),
      ];
    case 'eq_5band_parametric':
      return [
        make('low', 'low', clamp01((((candidateParams.band1_gain_db ?? 0) + 15) / 30) * 0.8 + values.weight * 0.2)),
        make('lowMid', 'lowMid', clamp01((((candidateParams.band2_gain_db ?? 0) + 15) / 30) * 0.8 + values.warmth * 0.2)),
        make('mid', 'mid', clamp01((((candidateParams.band3_gain_db ?? 0) + 15) / 30) * 0.8 + values.clarity * 0.2)),
        make('presence', 'presence', clamp01((((candidateParams.band4_gain_db ?? 0) + 15) / 30) * 0.75 + values.forwardness * 0.25)),
        make('air', 'air', clamp01((((candidateParams.band5_gain_db ?? 0) + 15) / 30) * 0.75 + values.air * 0.25)),
        make('trim', 'trim', clamp01(((candidateParams.trim_db ?? 0) + 6) / 12)),
      ];
    case 'eq_tilt_presence':
      return [
        make('weight', 'weight', clamp01((((candidateParams.tilt_amount_db ?? 0) + 9) / 18) * 0.6 + values.weight * 0.4)),
        make('clarity', 'clarity', clamp01((((candidateParams.presence_gain_db ?? 0) + 9) / 18) * 0.7 + values.clarity * 0.3)),
        make('air', 'air', clamp01((((candidateParams.air_gain_db ?? 0) + 9) / 18) * 0.7 + values.air * 0.3)),
        make('trim', 'trim', clamp01(((candidateParams.trim_db ?? 0) + 6) / 12)),
      ];
    case 'eq_resonant_creative':
      return [
        make('weight', 'weight', clamp01((((candidateParams.resonant_gain_db ?? 0) + 12) / 24) * 0.65 + values.weight * 0.35)),
        make('color', 'color', clamp01((((candidateParams.resonant_freq_hz ?? 1800) - 120) / 7880) * 0.45 + values.color * 0.55)),
        make('resonance', 'resonance', clamp01((((candidateParams.resonant_q ?? 1.4) - 0.7) / 7.3) * 0.75 + values.resonance * 0.25)),
        make('air', 'air', clamp01((((candidateParams.air_gain_db ?? 0) + 9) / 18) * 0.75 + values.air * 0.25)),
        make('trim', 'trim', clamp01(((candidateParams.trim_db ?? 0) + 6) / 12)),
      ];
    default:
      return [];
  }
}

function deriveSynthMacros(
  architectureId: SynthArchitectureId,
  target: OptimizationTargetVector,
  candidateParams: Record<string, number>,
): MacroControl[] {
  const values = target.values;
  const make = (id: MacroControl['id'], label: string, init: number): MacroControl => ({
    id,
    label,
    init: clamp01(init),
    min: 0,
    max: 1,
    step: 0.01,
  });

  const brightness = clamp01((((candidateParams.cutoff_hz ?? 2000) - 80) / (12000 - 80)) * 0.75 + values.brightness * 0.25);
  const body = clamp01((1 - (((candidateParams.cutoff_hz ?? 2000) - 80) / (12000 - 80)) * 0.45) * 0.7 + values.body * 0.3);
  const movement = clamp01((((candidateParams.vibrato_depth ?? candidateParams.lfo_depth ?? 0) * 8) + ((candidateParams.vibrato_rate ?? candidateParams.lfo_rate ?? 0.3) / 10) * 0.15) * 0.7 + values.movement * 0.3);
  const width = clamp01(((candidateParams.width_amt ?? candidateParams.detune ?? 0) * 0.9) + values.width * 0.1);
  const punch = clamp01((1 - (candidateParams.attack_s ?? candidateParams.decay_s ?? 0.2) / 2.5) * 0.7 + values.punch * 0.3);
  const character = clamp01(((candidateParams.drive_amt ?? candidateParams.detune ?? 0) * 0.75) + values.character * 0.25);

  switch (architectureId) {
    case 'mono_bass':
      return [
        make('brightness', 'brightness', brightness),
        make('body', 'body', body),
        make('drive', 'drive', clamp01((candidateParams.drive_amt ?? 0) / 1.5)),
        make('punch', 'punch', punch),
        make('movement', 'movement', movement),
      ];
    case 'supersaw_pad':
      return [
        make('brightness', 'brightness', brightness),
        make('movement', 'movement', movement),
        make('space', 'space', clamp01((candidateParams.reverb_mix ?? 0) / 0.6 * 0.75 + values.space * 0.25)),
        make('width', 'width', width),
        make('character', 'character', character),
      ];
    case 'velvet_pluck':
      return [
        make('brightness', 'brightness', brightness),
        make('punch', 'punch', punch),
        make('body', 'body', body),
        make('space', 'space', clamp01((candidateParams.echo_feedback ?? 0) / 0.6 * 0.65 + values.space * 0.35)),
        make('character', 'character', character),
      ];
    case 'stereo_lead':
      return [
        make('brightness', 'brightness', brightness),
        make('width', 'width', width),
        make('drive', 'drive', clamp01((candidateParams.drive_amt ?? 0) / 1.5)),
        make('movement', 'movement', movement),
        make('character', 'character', character),
      ];
  }
}

function deriveReverbMacros(
  architectureId: ReverbSpaceArchitectureId,
  target: OptimizationTargetVector,
  candidateParams: Record<string, number>,
): MacroControl[] {
  const values = target.values;
  const make = (id: MacroControl['id'], label: string, init: number): MacroControl => ({
    id,
    label,
    init: clamp01(init),
    min: 0,
    max: 1,
    step: 0.01,
  });

  const space = clamp01((candidateParams.space_amt ?? 0.5) * 0.7 + values.size * 0.3);
  const bloom = clamp01((candidateParams.bloom_amt ?? 0.5) * 0.7 + values.bloom * 0.3);
  const damping = clamp01((candidateParams.damping_amt ?? candidateParams.feedback_tone_amt ?? 0.45) * 0.65 + values.darkness * 0.35);
  const preDelay = clamp01((candidateParams.predelay_amt ?? 0.2) * 0.65 + values.predelay * 0.35);
  const diffusion = clamp01((candidateParams.diffusion_amt ?? 0.55) * 0.7 + values.density * 0.3);
  const modDepth = clamp01((candidateParams.mod_depth_amt ?? 0) * 0.7 + values.modulation * 0.3);
  const modRate = clamp01((candidateParams.mod_rate_amt ?? candidateParams.movement_amt ?? 0) * 0.7 + values.modulation * 0.3);
  const movement = clamp01((candidateParams.movement_amt ?? 0.3) * 0.7 + values.modulation * 0.3);
  const feedbackTone = clamp01((candidateParams.feedback_tone_amt ?? 0.45) * 0.7 + values.darkness * 0.3);

  switch (architectureId) {
    case 'plate_space':
    case 'hall_bloom':
      return [
        make('space', 'space', space),
        make('diffusion', 'diffusion', diffusion),
        make('damping', 'damping', damping),
        make('preDelay', 'preDelay', preDelay),
        make('bloom', 'bloom', bloom),
      ];
    case 'modulated_echo_verb':
      return [
        make('space', 'space', space),
        make('feedbackTone', 'feedbackTone', feedbackTone),
        make('modDepth', 'modDepth', modDepth),
        make('modRate', 'modRate', modRate),
        make('bloom', 'bloom', bloom),
      ];
    case 'dark_motion_verb':
      return [
        make('space', 'space', space),
        make('damping', 'damping', damping),
        make('movement', 'movement', movement),
        make('modDepth', 'modDepth', modDepth),
        make('bloom', 'bloom', bloom),
      ];
  }
}

function deriveDelayMacros(
  architectureId: DelayEchoArchitectureId,
  target: OptimizationTargetVector,
  candidateParams: Record<string, number>,
): MacroControl[] {
  const values = target.values;
  const make = (id: MacroControl['id'], label: string, init: number): MacroControl => ({
    id,
    label,
    init: clamp01(init),
    min: 0,
    max: 1,
    step: 0.01,
  });

  const space = clamp01((candidateParams.feedback_amt ?? candidateParams.time_amt ?? 0.5) * 0.6 + values.time * 0.15 + values.feedback * 0.25);
  const movement = clamp01((candidateParams.movement_amt ?? candidateParams.mod_depth_amt ?? 0.2) * 0.7 + values.modulation * 0.3);
  const character = clamp01((candidateParams.darkness_amt ?? 0.4) * 0.7 + values.darkness * 0.3);
  const width = clamp01((candidateParams.width_amt ?? 0.5) * 0.7 + values.width * 0.3);
  const feedbackTone = clamp01((candidateParams.darkness_amt ?? 0.4) * 0.6 + values.darkness * 0.4);
  const modDepth = clamp01((candidateParams.mod_depth_amt ?? candidateParams.movement_amt ?? 0.2) * 0.7 + values.modulation * 0.3);
  const modRate = clamp01((candidateParams.mod_rate_amt ?? candidateParams.movement_amt ?? 0.2) * 0.7 + values.modulation * 0.3);
  const bloom = clamp01((candidateParams.diffusion_amt ?? 0.3) * 0.65 + values.diffusion * 0.35);

  switch (architectureId) {
    case 'tempo_echo':
      return [
        make('space', 'space', space),
        make('movement', 'movement', movement),
        make('character', 'character', character),
        make('width', 'width', width),
      ];
    case 'modulated_echo_delay':
      return [
        make('space', 'space', space),
        make('feedbackTone', 'feedbackTone', feedbackTone),
        make('modDepth', 'modDepth', modDepth),
        make('modRate', 'modRate', modRate),
        make('bloom', 'bloom', bloom),
      ];
  }
}

function buildParameterSchema(architectureId: OptimizationArchitectureId, params: Record<string, number>): PluginParameter[] {
  const category = architectureId.startsWith('eq_')
    ? 'parametric_eq'
    : architectureId === 'tempo_echo' || architectureId === 'modulated_echo_delay'
      ? 'delay_echo'
    : architectureId === 'plate_space' || architectureId === 'hall_bloom' || architectureId === 'modulated_echo_verb' || architectureId === 'dark_motion_verb'
      ? 'reverb_space'
      : 'synth';
  const architecture = getOptimizationArchitecture(category as 'parametric_eq' | 'synth' | 'reverb_space' | 'delay_echo', architectureId);
  return architecture.parameterRanges.map((range) => ({
    id: range.id,
    label: range.id.replace(/_/g, ' '),
    kind: 'slider',
    init: params[range.id] ?? range.initial,
    min: range.min,
    max: range.max,
    step: Math.max((range.max - range.min) / 100, 0.001),
  }));
}

export function buildParametricEqSpec(args: {
  prompt: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
}): PluginSpec {
  const voiceArchitecture = args.candidate.architectureId as VoiceArchitecture;
  const spec: PluginSpec = {
    schemaVersion: '1.0',
    kind: 'effect',
    name: baseNameForArchitecture(args.candidate.architectureId),
    description: args.prompt.slice(0, 160),
    voiceArchitecture,
    toneModel: pickToneModel(args.candidate.architectureId),
    qualityProfile: 'premium',
    stereoProfile: 'stereo',
    macroControls: deriveEqMacros(args.candidate.architectureId, args.target, args.candidate.params),
    io: {
      inputs: 2,
      outputs: 2,
    },
    parameters: [],
    graph: {
      source: {
        type: 'effect',
      },
      processors: [],
    },
  };

  return parseAndValidatePluginSpec(JSON.stringify(spec));
}

function buildReverbSpec(args: {
  prompt: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
}): PluginSpec {
  const architectureId = args.candidate.architectureId as ReverbSpaceArchitectureId;
  const spec: PluginSpec = {
    schemaVersion: '1.0',
    kind: 'effect',
    name: baseNameForArchitecture(architectureId),
    description: args.prompt.slice(0, 160),
    voiceArchitecture: architectureId,
    toneModel: pickToneModel(architectureId),
    qualityProfile: 'premium',
    stereoProfile: architectureId === 'hall_bloom' || architectureId === 'dark_motion_verb' ? 'wide' : 'stereo',
    macroControls: deriveReverbMacros(architectureId, args.target, args.candidate.params),
    io: {
      inputs: 2,
      outputs: 2,
    },
    parameters: buildParameterSchema(architectureId, args.candidate.params),
    graph: {
      source: {
        type: 'effect',
      },
      processors: [],
    },
  };

  return parseAndValidatePluginSpec(JSON.stringify(spec));
}

function buildDelaySpec(args: {
  prompt: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
}): PluginSpec {
  const architectureId = args.candidate.architectureId as DelayEchoArchitectureId;
  const voiceArchitecture = architectureId === 'modulated_echo_delay' ? 'modulated_echo_verb' : 'tempo_echo';
  const spec: PluginSpec = {
    schemaVersion: '1.0',
    kind: 'effect',
    name: baseNameForArchitecture(architectureId),
    description: args.prompt.slice(0, 160),
    voiceArchitecture,
    toneModel: pickToneModel(architectureId),
    qualityProfile: 'premium',
    stereoProfile: architectureId === 'modulated_echo_delay' ? 'wide' : 'stereo',
    macroControls: deriveDelayMacros(architectureId, args.target, args.candidate.params),
    io: {
      inputs: 2,
      outputs: 2,
    },
    parameters: buildParameterSchema(architectureId, args.candidate.params),
    graph: {
      source: {
        type: 'effect',
      },
      processors: [],
    },
  };

  return parseAndValidatePluginSpec(JSON.stringify(spec));
}

function buildSynthGraphSpec(args: {
  prompt: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
}): PluginSpec {
  const architectureId = args.candidate.architectureId as SynthArchitectureId;
  const params = args.candidate.params;
  const parameters = buildParameterSchema(architectureId, params);
  const common = {
    schemaVersion: '1.0' as const,
    kind: 'synth' as const,
    name: baseNameForArchitecture(architectureId),
    description: args.prompt.slice(0, 160),
    voiceArchitecture: 'custom_graph' as const,
    toneModel: pickToneModel(architectureId),
    qualityProfile: 'premium' as const,
    parameters,
  };

  switch (architectureId) {
    case 'mono_bass':
      return parseAndValidatePluginSpec(JSON.stringify({
        ...common,
        stereoProfile: 'mono',
        macroControls: deriveSynthMacros(architectureId, args.target, params),
        io: { inputs: 0, outputs: 1 },
        modulation: {
          modulators: [
            { id: 'vibrato', kind: 'lfo', shape: 'osc', rate: 'vibrato_rate' },
          ],
          routes: [
            { sourceId: 'vibrato', targetId: 'freq', depth: params.vibrato_depth ?? 0.01 },
          ],
        },
        graph: {
          source: {
            type: 'synth',
            oscillators: [
              { library: 'os', symbol: 'sawtooth', frequency: 'freq' },
              { library: 'os', symbol: 'square', frequency: 'freq', gain: 0.35 },
            ],
            envelope: { library: 'en', symbol: 'adsr', attack: 0.005, decay: 0.12, sustain: 0.7, release: params.release_s ?? 0.25 },
            performance: {
              portamentoTime: params.glide_time ?? 0.08,
              portamentoMode: 'always',
              legato: true,
              notePriority: 'last',
            },
          },
          processors: [
            { kind: 'filter', library: 'fi', symbol: 'resonlp', cutoff: 'cutoff_hz', resonance: 'resonance' },
            { kind: 'distortion', library: 'ef', symbol: 'cubicnl', drive: 'drive_amt' },
          ],
        },
      }), 'synth');
    case 'supersaw_pad':
      return parseAndValidatePluginSpec(JSON.stringify({
        ...common,
        stereoProfile: 'wide',
        macroControls: deriveSynthMacros(architectureId, args.target, params),
        io: { inputs: 0, outputs: 2 },
        modulation: {
          modulators: [
            { id: 'pad_lfo', kind: 'lfo', shape: 'triangle', rate: 'lfo_rate' },
          ],
          routes: [
            { sourceId: 'pad_lfo', targetId: 'cutoff_hz', depth: params.lfo_depth ?? 0.15 },
          ],
        },
        graph: {
          source: {
            type: 'synth',
            oscillators: [
              { library: 'os', symbol: 'sawtooth', frequency: 'freq', detuneSemitones: -((params.detune ?? 0.08) * 12), gain: 0.5 },
              { library: 'os', symbol: 'sawtooth', frequency: 'freq', gain: 0.5 },
              { library: 'os', symbol: 'sawtooth', frequency: 'freq', detuneSemitones: (params.detune ?? 0.08) * 12, gain: 0.5 },
            ],
            envelope: { library: 'en', symbol: 'adsr', attack: params.attack_s ?? 0.4, decay: 0.4, sustain: 0.85, release: params.release_s ?? 1.8 },
          },
          processors: [
            { kind: 'filter', library: 'fi', symbol: 'lowpass', cutoff: 'cutoff_hz' },
            { kind: 'spatial', library: 'sp', symbol: 'panner', position: 'width_amt' },
            { kind: 'faust', library: 're', symbol: 'stereo_freeverb', args: ['reverb_mix'], channelMode: 'stereo_only' },
          ],
        },
      }), 'synth');
    case 'velvet_pluck':
      return parseAndValidatePluginSpec(JSON.stringify({
        ...common,
        stereoProfile: 'stereo',
        macroControls: deriveSynthMacros(architectureId, args.target, params),
        io: { inputs: 0, outputs: 2 },
        graph: {
          source: {
            type: 'synth',
            oscillators: [
              { library: 'os', symbol: 'triangle', frequency: 'freq', gain: 0.65 },
              { library: 'os', symbol: 'square', frequency: 'freq', gain: 0.25 },
            ],
            noise: { library: 'no', symbol: 'pink_noise', gain: 0.08 },
            envelope: { library: 'en', symbol: 'adsr', attack: 0.001, decay: params.decay_s ?? 0.35, sustain: 0.08, release: params.release_s ?? 0.25 },
          },
          processors: [
            { kind: 'filter', library: 'fi', symbol: 'resonbp', cutoff: 'cutoff_hz', resonance: 'brightness_q' },
            { kind: 'distortion', library: 'ef', symbol: 'softclipQuadratic', drive: 'drive_amt' },
            { kind: 'delay', library: 'ef', symbol: 'echo', time: 'echo_time', feedback: 'echo_feedback', maxTime: 1.2 },
          ],
        },
      }), 'synth');
    case 'stereo_lead':
      return parseAndValidatePluginSpec(JSON.stringify({
        ...common,
        stereoProfile: 'wide',
        macroControls: deriveSynthMacros(architectureId, args.target, params),
        io: { inputs: 0, outputs: 2 },
        modulation: {
          modulators: [
            { id: 'lead_vibrato', kind: 'lfo', shape: 'osc', rate: 'vibrato_rate' },
          ],
          routes: [
            { sourceId: 'lead_vibrato', targetId: 'freq', depth: params.vibrato_depth ?? 0.02 },
          ],
        },
        graph: {
          source: {
            type: 'synth',
            oscillators: [
              { library: 'os', symbol: 'sawtooth', frequency: 'freq' },
              { library: 'os', symbol: 'triangle', frequency: 'freq', gain: 0.22 },
            ],
            envelope: { library: 'en', symbol: 'adsr', attack: 0.01, decay: 0.18, sustain: 0.72, release: 0.3 },
            performance: {
              portamentoTime: params.glide_time ?? 0.16,
              portamentoMode: 'always',
              legato: true,
              notePriority: 'last',
            },
          },
          processors: [
            { kind: 'filter', library: 'fi', symbol: 'resonlp', cutoff: 'cutoff_hz', resonance: 'resonance' },
            { kind: 'distortion', library: 'ef', symbol: 'wavefold', drive: 'drive_amt' },
            { kind: 'spatial', library: 'sp', symbol: 'panner', position: 'width_amt' },
          ],
        },
      }), 'synth');
  }
}

function finalizeArtifacts(
  spec: PluginSpec,
  metadata: Record<string, unknown>,
  uiScheme:
    | ReturnType<typeof buildParametricEqUiScheme>
    | ReturnType<typeof buildSynthUiScheme>
    | ReturnType<typeof buildReverbUiScheme>
    | ReturnType<typeof buildDelayEchoUiScheme>,
) {
  const normalized = normalizeOptimizationArtifacts({
    faustCode: emitFaustFromSpec(spec),
    parameterSchema: spec.parameters,
    macroControls: spec.macroControls,
    uiSpec: buildUiSpecFromPlannedScheme(uiScheme),
    metadata,
  });

  return {
    spec,
    ...normalized,
  };
}

export function emitParametricEqArtifacts(args: {
  prompt: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
}): NormalizedGeneratedArtifacts & { spec: PluginSpec } {
  const spec = buildParametricEqSpec(args);
  const architecture = getOptimizationArchitecture('parametric_eq', args.candidate.architectureId);
  return finalizeArtifacts(
    spec,
    {
      category: 'parametric_eq',
      architectureId: args.candidate.architectureId,
      score: args.candidate.score,
    },
    buildParametricEqUiScheme({
      pluginTitle: spec.name,
      pluginSubtitle: spec.description ?? '',
      architecture,
    }),
  );
}

export function emitSynthArtifacts(args: {
  prompt: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
}): NormalizedGeneratedArtifacts & { spec: PluginSpec } {
  const spec = buildSynthGraphSpec(args);
  const architecture = getOptimizationArchitecture('synth', args.candidate.architectureId);
  return finalizeArtifacts(
    spec,
    {
      category: 'synth',
      architectureId: args.candidate.architectureId,
      score: args.candidate.score,
    },
    buildSynthUiScheme({
      pluginTitle: spec.name,
      pluginSubtitle: spec.description ?? '',
      architecture,
    }),
  );
}

export function emitReverbSpaceArtifacts(args: {
  prompt: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
}): NormalizedGeneratedArtifacts & { spec: PluginSpec } {
  const spec = buildReverbSpec(args);
  const architecture = getOptimizationArchitecture('reverb_space', args.candidate.architectureId);
  return finalizeArtifacts(
    spec,
    {
      category: 'reverb_space',
      architectureId: args.candidate.architectureId,
      score: args.candidate.score,
    },
    buildReverbUiScheme({
      pluginTitle: spec.name,
      pluginSubtitle: spec.description ?? '',
      architecture,
    }),
  );
}

export function emitDelayEchoArtifacts(args: {
  prompt: string;
  target: OptimizationTargetVector;
  candidate: OptimizationCandidateResult;
}): NormalizedGeneratedArtifacts & { spec: PluginSpec } {
  const spec = buildDelaySpec(args);
  const architecture = getOptimizationArchitecture('delay_echo', args.candidate.architectureId);
  return finalizeArtifacts(
    spec,
    {
      category: 'delay_echo',
      architectureId: args.candidate.architectureId,
      score: args.candidate.score,
    },
    buildDelayEchoUiScheme({
      pluginTitle: spec.name,
      pluginSubtitle: spec.description ?? '',
      architecture,
    }),
  );
}
