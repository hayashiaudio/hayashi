import type {
  MacroControl,
  PluginKind,
  PluginSpec,
  QualityProfile,
  StereoProfile,
  ToneModel,
  VoiceArchitecture,
} from './spec-runtime.js';
import type { TemplateUiMetadata, UiMeter, UiStyle, UiVisualizerSpec } from '../ui/types.js';

export interface TemplateExpectation {
  metric: 'peak_db' | 'rms' | 'stereo_correlation' | 'spectral_centroid_hz' | 'decay_ms';
  target: 'min' | 'max' | 'range';
  value?: number;
  min?: number;
  max?: number;
  rationale: string;
}

export interface TemplateDefaultMacro {
  id: MacroControl['id'];
  label: string;
  init: number;
}

export interface TemplateDefinition {
  id: Exclude<VoiceArchitecture, 'custom_graph'>;
  supportedKinds: PluginKind[];
  requiredMacros: MacroControl['id'][];
  allowedToneModels: ToneModel[];
  allowedStereoProfiles: StereoProfile[];
  allowedQualityProfiles: QualityProfile[];
  defaultStereoProfile: StereoProfile;
  defaultQualityProfile: QualityProfile;
  defaults: {
    toneModel: ToneModel;
    macros: TemplateDefaultMacro[];
  };
  ui: TemplateUiMetadata;
  scalingNotes: string[];
  evaluationExpectations: TemplateExpectation[];
  emit: (spec: PluginSpec) => string;
}

function macroMap(macros: MacroControl[]) {
  return new Map(macros.map((macro) => [macro.id, macro]));
}

function macroLine(macros: Map<string, MacroControl>, id: MacroControl['id'], fallbackLabel: string, fallbackInit: number) {
  const macro = macros.get(id);
  const label = macro?.label ?? fallbackLabel;
  const init = macro?.init ?? fallbackInit;
  const min = macro?.min ?? 0;
  const max = macro?.max ?? 1;
  const step = macro?.step ?? 0.01;
  return `${id} = hslider("${label}", ${init}, ${min}, ${max}, ${step});`;
}

function linesForMacros(macros: MacroControl[], defaults: TemplateDefaultMacro[]) {
  const byId = macroMap(macros);
  return defaults.map((item) => macroLine(byId, item.id, item.label, item.init));
}

const BANDPASS_Q_HELPER = 'bandpassQ(center, q) = fi.highpass(2, max(20.0, center / max(1.15, 2.6 - q * 0.45))) : fi.lowpass(2, min(18000.0, center * max(1.15, 2.6 - q * 0.45)));';

function brightnessBase(toneModel: ToneModel) {
  switch (toneModel) {
    case 'dark_ambient': return 420;
    case 'tape_vintage': return 880;
    case 'analog_warm': return 1250;
    case 'lush_spacious': return 1850;
    case 'modern_wide': return 2650;
    case 'clean_precise': return 3300;
  }
}

function reverbSpread(qualityProfile: QualityProfile | undefined) {
  return qualityProfile === 'premium' ? 68 : 40;
}

function premiumMultiplier(qualityProfile: QualityProfile | undefined, premium: number, standard: number) {
  return qualityProfile === 'premium' ? premium : standard;
}

function monoDryWetProcess(wetChain: string) {
  return `process = _ <: (*(1.0 - mix)), (${wetChain} : *(mix)) : +`;
}

function stereoDryWetProcess(input: string, wetChain: string) {
  return `process = ${input} <: par(i,2,*(1.0 - mix)), (${wetChain} : par(i,2,*(mix))) : par(i,2,+)`;
}

function section(
  id: string,
  label: string,
  layout: 'row' | 'column' | 'grid',
  controls: MacroControl['id'][]
): TemplateUiMetadata['defaultSections'][number] {
  return { id, label, layout, controls };
}

function makeUiMetadata(params: {
  uiFamily: TemplateUiMetadata['uiFamily'];
  preferredUiStyle: UiStyle;
  heroControls: MacroControl['id'][];
  defaultSections: TemplateUiMetadata['defaultSections'];
  defaultVisualizers: UiVisualizerSpec[];
  defaultMeters: UiMeter[];
  sidebar?: boolean;
  accent: TemplateUiMetadata['themeTokens']['accent'];
  surface?: TemplateUiMetadata['themeTokens']['surface'];
  glow?: number;
}): TemplateUiMetadata {
  return {
    uiFamily: params.uiFamily,
    preferredUiStyle: params.preferredUiStyle,
    heroControls: params.heroControls,
    defaultSections: params.defaultSections,
    allowedVisualizers: [...new Set(params.defaultVisualizers.map((visualizer) => visualizer.type))],
    defaultVisualizers: params.defaultVisualizers,
    defaultMeters: params.defaultMeters,
    defaultLayoutHints: {
      density: 'comfortable',
      heroSize: 'large',
      sidebar: params.sidebar ?? false,
    },
    themeTokens: {
      accent: params.accent,
      surface: params.surface ?? 'graphite',
      glow: params.glow ?? 0.3,
    },
  };
}

const MONO_BASS_MACROS: TemplateDefaultMacro[] = [
  { id: 'brightness', label: 'brightness', init: 0.45 },
  { id: 'body', label: 'body', init: 0.72 },
  { id: 'drive', label: 'drive', init: 0.38 },
  { id: 'punch', label: 'punch', init: 0.68 },
  { id: 'movement', label: 'movement', init: 0.12 },
];

const SUPERSAW_PAD_MACROS: TemplateDefaultMacro[] = [
  { id: 'brightness', label: 'brightness', init: 0.58 },
  { id: 'movement', label: 'movement', init: 0.42 },
  { id: 'space', label: 'space', init: 0.54 },
  { id: 'width', label: 'width', init: 0.76 },
  { id: 'character', label: 'character', init: 0.52 },
];

const VELVET_PLUCK_MACROS: TemplateDefaultMacro[] = [
  { id: 'brightness', label: 'brightness', init: 0.62 },
  { id: 'punch', label: 'punch', init: 0.78 },
  { id: 'body', label: 'body', init: 0.38 },
  { id: 'space', label: 'space', init: 0.24 },
  { id: 'character', label: 'character', init: 0.48 },
];

const STEREO_LEAD_MACROS: TemplateDefaultMacro[] = [
  { id: 'brightness', label: 'brightness', init: 0.64 },
  { id: 'width', label: 'width', init: 0.54 },
  { id: 'drive', label: 'drive', init: 0.34 },
  { id: 'movement', label: 'movement', init: 0.28 },
  { id: 'character', label: 'character', init: 0.46 },
];

const PLATE_SPACE_MACROS: TemplateDefaultMacro[] = [
  { id: 'space', label: 'space', init: 0.66 },
  { id: 'diffusion', label: 'diffusion', init: 0.62 },
  { id: 'damping', label: 'damping', init: 0.34 },
  { id: 'preDelay', label: 'preDelay', init: 0.18 },
  { id: 'bloom', label: 'bloom', init: 0.44 },
];

const HALL_BLOOM_MACROS: TemplateDefaultMacro[] = [
  { id: 'space', label: 'space', init: 0.78 },
  { id: 'diffusion', label: 'diffusion', init: 0.72 },
  { id: 'damping', label: 'damping', init: 0.48 },
  { id: 'preDelay', label: 'preDelay', init: 0.22 },
  { id: 'bloom', label: 'bloom', init: 0.58 },
];

const MICROSHIFT_WIDENER_MACROS: TemplateDefaultMacro[] = [
  { id: 'width', label: 'width', init: 0.58 },
  { id: 'modDepth', label: 'modDepth', init: 0.28 },
  { id: 'modRate', label: 'modRate', init: 0.22 },
  { id: 'brightness', label: 'brightness', init: 0.56 },
  { id: 'ducking', label: 'ducking', init: 0.16 },
];

const MODULATED_ECHO_VERB_MACROS: TemplateDefaultMacro[] = [
  { id: 'space', label: 'space', init: 0.52 },
  { id: 'feedbackTone', label: 'feedbackTone', init: 0.46 },
  { id: 'modDepth', label: 'modDepth', init: 0.34 },
  { id: 'modRate', label: 'modRate', init: 0.24 },
  { id: 'bloom', label: 'bloom', init: 0.42 },
];

const DARK_MOTION_VERB_MACROS: TemplateDefaultMacro[] = [
  { id: 'space', label: 'space', init: 0.64 },
  { id: 'damping', label: 'damping', init: 0.62 },
  { id: 'movement', label: 'movement', init: 0.36 },
  { id: 'modDepth', label: 'modDepth', init: 0.26 },
  { id: 'bloom', label: 'bloom', init: 0.4 },
];

const TEMPO_ECHO_MACROS: TemplateDefaultMacro[] = [
  { id: 'space', label: 'space', init: 0.52 },
  { id: 'movement', label: 'movement', init: 0.16 },
  { id: 'character', label: 'character', init: 0.44 },
  { id: 'width', label: 'width', init: 0.5 },
];

const CHORUS_REVERB_MACROS: TemplateDefaultMacro[] = [
  { id: 'space', label: 'space', init: 0.66 },
  { id: 'movement', label: 'movement', init: 0.48 },
  { id: 'width', label: 'width', init: 0.72 },
  { id: 'character', label: 'character', init: 0.38 },
  { id: 'brightness', label: 'brightness', init: 0.58 },
];

const TAPE_SATURATOR_MACROS: TemplateDefaultMacro[] = [
  { id: 'drive', label: 'drive', init: 0.32 },
  { id: 'character', label: 'character', init: 0.52 },
  { id: 'body', label: 'body', init: 0.48 },
  { id: 'brightness', label: 'brightness', init: 0.42 },
];

const ANALOG_LADDER_FILTER_MACROS: TemplateDefaultMacro[] = [
  { id: 'brightness', label: 'brightness', init: 0.52 },
  { id: 'resonanceShape', label: 'resonanceShape', init: 0.46 },
  { id: 'tracking', label: 'tracking', init: 0.38 },
  { id: 'saturationPre', label: 'saturationPre', init: 0.24 },
  { id: 'saturationPost', label: 'saturationPost', init: 0.18 },
];

const DRIVE_FILTER_BUS_MACROS: TemplateDefaultMacro[] = [
  { id: 'drive', label: 'drive', init: 0.36 },
  { id: 'body', label: 'body', init: 0.44 },
  { id: 'brightness', label: 'brightness', init: 0.54 },
  { id: 'saturationPre', label: 'saturationPre', init: 0.28 },
  { id: 'saturationPost', label: 'saturationPost', init: 0.18 },
];

const SURGICAL_TONE_FILTER_MACROS: TemplateDefaultMacro[] = [
  { id: 'brightness', label: 'brightness', init: 0.5 },
  { id: 'sweepRange', label: 'sweepRange', init: 0.34 },
  { id: 'notchAmount', label: 'notchAmount', init: 0.22 },
  { id: 'tracking', label: 'tracking', init: 0.26 },
  { id: 'character', label: 'character', init: 0.18 },
];

const FORMANT_SWEEPER_MACROS: TemplateDefaultMacro[] = [
  { id: 'vowelShift', label: 'vowelShift', init: 0.48 },
  { id: 'movement', label: 'movement', init: 0.42 },
  { id: 'resonanceShape', label: 'resonanceShape', init: 0.36 },
  { id: 'brightness', label: 'brightness', init: 0.56 },
  { id: 'character', label: 'character', init: 0.34 },
];

const RESONANT_MOTION_FILTER_MACROS: TemplateDefaultMacro[] = [
  { id: 'movement', label: 'movement', init: 0.48 },
  { id: 'resonanceShape', label: 'resonanceShape', init: 0.42 },
  { id: 'sweepRange', label: 'sweepRange', init: 0.46 },
  { id: 'brightness', label: 'brightness', init: 0.54 },
  { id: 'tracking', label: 'tracking', init: 0.32 },
];

const WAH_TEXTURE_FILTER_MACROS: TemplateDefaultMacro[] = [
  { id: 'movement', label: 'movement', init: 0.56 },
  { id: 'sweepRange', label: 'sweepRange', init: 0.5 },
  { id: 'resonanceShape', label: 'resonanceShape', init: 0.34 },
  { id: 'character', label: 'character', init: 0.38 },
  { id: 'body', label: 'body', init: 0.3 },
];

const EQ_3BAND_MUSICAL_MACROS: TemplateDefaultMacro[] = [
  { id: 'low', label: 'low', init: 0.56 },
  { id: 'mid', label: 'mid', init: 0.5 },
  { id: 'high', label: 'high', init: 0.58 },
  { id: 'presence', label: 'presence', init: 0.52 },
  { id: 'trim', label: 'trim', init: 0.5 },
];

const EQ_5BAND_PARAMETRIC_MACROS: TemplateDefaultMacro[] = [
  { id: 'low', label: 'low', init: 0.5 },
  { id: 'lowMid', label: 'lowMid', init: 0.48 },
  { id: 'mid', label: 'mid', init: 0.5 },
  { id: 'presence', label: 'presence', init: 0.54 },
  { id: 'air', label: 'air', init: 0.56 },
  { id: 'trim', label: 'trim', init: 0.5 },
];

const EQ_TILT_PRESENCE_MACROS: TemplateDefaultMacro[] = [
  { id: 'weight', label: 'weight', init: 0.54 },
  { id: 'clarity', label: 'clarity', init: 0.52 },
  { id: 'air', label: 'air', init: 0.56 },
  { id: 'trim', label: 'trim', init: 0.5 },
];

const EQ_RESONANT_CREATIVE_MACROS: TemplateDefaultMacro[] = [
  { id: 'weight', label: 'weight', init: 0.52 },
  { id: 'color', label: 'color', init: 0.58 },
  { id: 'resonance', label: 'resonance', init: 0.55 },
  { id: 'air', label: 'air', init: 0.48 },
  { id: 'trim', label: 'trim', init: 0.5 },
];

const IMPACT_HIT_MACROS: TemplateDefaultMacro[] = [
  { id: 'punch', label: 'punch', init: 0.84 },
  { id: 'body', label: 'body', init: 0.54 },
  { id: 'brightness', label: 'brightness', init: 0.58 },
  { id: 'character', label: 'character', init: 0.44 },
];

function emitMonoBass(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, MONO_BASS_MACROS);
  const baseCutoff = brightnessBase(spec.toneModel);
  const outputTrim = premiumMultiplier(spec.qualityProfile, 0.84, 0.9);
  const spread = spec.stereoProfile === 'wide' ? 'sp.panner(0.58)' : spec.io.outputs === 2 ? 'sp.panner(0.5)' : '';

  return [
    'import("stdfaust.lib");',
    'freq = hslider("freq [Hz]", 55, 20, 4000, 1);',
    'gain = hslider("gain", 0.8, 0, 1, 0.01);',
    'gate = button("gate");',
    ...macros,
    'attack = 0.002 + (1.0 - punch) * 0.014;',
    'decay = 0.05 + (1.0 - punch) * 0.12;',
    'sustain = 0.45 + body * 0.28;',
    'release = 0.08 + (1.0 - punch) * 0.18;',
    'env = en.adsr(attack, decay, sustain, release, gate);',
    'sub = os.square(freq * 0.5) * (0.18 + body * 0.22);',
    'core = os.sawtooth(freq) * (0.74 + drive * 0.1);',
    'edge = os.square(freq) * (0.05 + drive * 0.08);',
    'motionLfo = os.osc(0.16 + movement * 0.55) * (90 + movement * 520);',
    `cutoff = ${baseCutoff} + brightness * 3200 + motionLfo;`,
    'q = 0.9 + brightness * 2.4;',
    `src = (core + sub + edge) * env * gain * ${outputTrim};`,
    'colored = src : fi.resonlp(cutoff, q, 0.92) : ef.cubicnl(0.18 + drive * 0.82, 0.0);',
    `process = ${spread ? `colored : ${spread}` : 'colored'};`,
  ].join('\n');
}

function emitSupersawPad(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, SUPERSAW_PAD_MACROS);
  const baseCutoff = brightnessBase(spec.toneModel) + 1000;
  const spread = reverbSpread(spec.qualityProfile);
  const output = spec.io.outputs === 1 ? 'left + right * 0.5' : 'left,right';
  const trim = premiumMultiplier(spec.qualityProfile, 0.68, 0.74);

  return [
    'import("stdfaust.lib");',
    'freq = hslider("freq [Hz]", 220, 20, 4000, 1);',
    'gain = hslider("gain", 0.65, 0, 1, 0.01);',
    'gate = button("gate");',
    ...macros,
    'env = en.adsr(0.04 + (1.0 - movement) * 0.12, 0.22, 0.74, 0.55 + space * 0.9, gate);',
    `detune = ${premiumMultiplier(spec.qualityProfile, 0.0055, 0.004)} + width * ${premiumMultiplier(spec.qualityProfile, 0.014, 0.012)};`,
    'lfo = os.osc(0.05 + movement * 0.25);',
    `cutoff = ${baseCutoff} + brightness * 4200 + lfo * (220 + movement * 980);`,
    'leftRaw = (os.sawtooth(freq * (1 - detune)) + os.sawtooth(freq) + os.sawtooth(freq * (1 + detune * 1.3))) / 3;',
    'rightRaw = (os.sawtooth(freq * (1 - detune * 1.35)) + os.sawtooth(freq * (1 + detune * 0.15)) + os.sawtooth(freq * (1 + detune * 1.6))) / 3;',
    `left = leftRaw * env * gain * ${trim} : fi.lowpass(4, cutoff) : ef.cubicnl(0.08 + character * 0.22, 0.0);`,
    `right = rightRaw * env * gain * ${trim} : fi.lowpass(4, cutoff * (1.01 + width * 0.04)) : ef.cubicnl(0.08 + character * 0.22, 0.0);`,
    `process = ${output} : re.stereo_freeverb(0.72 + space * 0.18, 0.55, 0.22 + movement * 0.22, ${spread});`,
  ].join('\n');
}

function emitVelvetPluck(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, VELVET_PLUCK_MACROS);
  const baseCutoff = brightnessBase(spec.toneModel) + 650;
  const reverbSize = premiumMultiplier(spec.qualityProfile, 0.7, 0.62);

  if (spec.io.outputs === 1) {
    return [
      'import("stdfaust.lib");',
      'freq = hslider("freq [Hz]", 330, 20, 4000, 1);',
      'gain = hslider("gain", 0.72, 0, 1, 0.01);',
      'gate = button("gate");',
      ...macros,
      'env = en.adsr(0.002 + (1.0 - punch) * 0.012, 0.09 + (1.0 - punch) * 0.22, 0.1 + body * 0.18, 0.16 + space * 0.55, gate);',
      `cutoff = ${baseCutoff} + brightness * 3900;`,
      'core = (os.sawtooth(freq) * (0.52 + character * 0.08)) + (os.triangle(freq * 1.002) * (0.34 + body * 0.16));',
      'noiseTick = no.pink_noise * (0.01 + punch * 0.035);',
      'pre = (core + noiseTick) * env * gain * 0.78;',
      'process = pre : fi.lowpass(4, cutoff) : ef.cubicnl(0.05 + character * 0.18, 0.0) : ef.echo(0.6, 0.11 + space * 0.05, 0.08 + space * 0.18) : re.mono_freeverb(0.14 + space * 0.16);',
    ].join('\n');
  }

  return [
    'import("stdfaust.lib");',
    'freq = hslider("freq [Hz]", 330, 20, 4000, 1);',
    'gain = hslider("gain", 0.72, 0, 1, 0.01);',
    'gate = button("gate");',
    ...macros,
    'env = en.adsr(0.002 + (1.0 - punch) * 0.012, 0.08 + (1.0 - punch) * 0.18, 0.08 + body * 0.16, 0.12 + space * 0.48, gate);',
    `cutoff = ${baseCutoff} + brightness * 3900;`,
    'leftRaw = (os.sawtooth(freq) + os.triangle(freq * 1.0015)) * 0.5;',
    'rightRaw = (os.sawtooth(freq * 1.002) + os.triangle(freq * 0.9995)) * 0.5;',
    'noiseTick = no.pink_noise * (0.008 + punch * 0.028);',
    'left = (leftRaw + noiseTick) * env * gain * 0.74 : fi.lowpass(4, cutoff) : ef.cubicnl(0.05 + character * 0.18, 0.0) : ef.echo(0.7, 0.1 + space * 0.04, 0.08 + space * 0.2);',
    'right = (rightRaw + noiseTick) * env * gain * 0.74 : fi.lowpass(4, cutoff * 1.025) : ef.cubicnl(0.05 + character * 0.18, 0.0) : ef.echo(0.7, 0.12 + space * 0.05, 0.08 + space * 0.2);',
    `process = left,right : re.stereo_freeverb(${reverbSize}, 0.48, 0.18 + space * 0.15, ${reverbSpread(spec.qualityProfile)});`,
  ].join('\n');
}

function emitStereoLead(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, STEREO_LEAD_MACROS);
  const baseCutoff = brightnessBase(spec.toneModel) + 850;
  const stereoOutput = spec.io.outputs === 1 ? 'leadL + leadR * 0.5' : 'leadL,leadR';
  const reverbTail = premiumMultiplier(spec.qualityProfile, 0.16, 0.1);

  return [
    'import("stdfaust.lib");',
    'freq = hslider("freq [Hz]", 440, 20, 4000, 1);',
    'gain = hslider("gain", 0.74, 0, 1, 0.01);',
    'gate = button("gate");',
    ...macros,
    'env = en.adsr(0.01 + (1.0 - punch) * 0.02, 0.12, 0.68, 0.2 + movement * 0.25, gate);',
    'vibrato = os.osc(4.6 + movement * 1.8) * (0.002 + movement * 0.004);',
    `cutoff = ${baseCutoff} + brightness * 3600 + os.osc(0.18 + movement * 0.42) * (70 + movement * 240);`,
    'leadL = ((os.sawtooth(freq * (1 + vibrato)) * 0.62) + (os.square(freq * (1.002 + width * 0.004)) * 0.22) + (os.triangle(freq * 0.5) * (0.1 + character * 0.08))) * env * gain * 0.72 : fi.lowpass(4, cutoff) : ef.cubicnl(0.12 + drive * 0.34, 0.0);',
    'leadR = ((os.sawtooth(freq * (1 - vibrato * 0.9)) * 0.62) + (os.square(freq * (0.998 - width * 0.003)) * 0.22) + (os.triangle(freq * 0.5) * (0.1 + character * 0.08))) * env * gain * 0.72 : fi.lowpass(4, cutoff * (1.01 + width * 0.03)) : ef.cubicnl(0.12 + drive * 0.34, 0.0);',
    spec.io.outputs === 1
      ? `process = ${stereoOutput} : re.mono_freeverb(${reverbTail});`
      : `process = ${stereoOutput} : re.stereo_freeverb(0.55 + width * 0.12, 0.42, 0.16 + movement * 0.12, ${reverbSpread(spec.qualityProfile) - 10});`,
  ].join('\n');
}

function emitPlateSpace(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, PLATE_SPACE_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_ <: _,_';
  const spread = reverbSpread(spec.qualityProfile) + 8;
  const wetChain = `par(i,2,*(input_gain)) : par(i,2,fi.lowpass(2, airCut)) : par(i,2,ef.echo(0.35, predelayTime, predelayFb)) : re.stereo_freeverb(plateSize, 0.52 + diffusion * 0.08, plateDamp, ${spread})`;

  return [
    'import("stdfaust.lib");',
    'mix = hslider("mix", 0.48, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'predelayTime = 0.015 + preDelay * 0.085;',
    'predelayFb = 0.02 + bloom * 0.08;',
    'airCut = 7200 - damping * 3600;',
    'plateSize = 0.62 + space * 0.22;',
    'plateDamp = 0.12 + damping * 0.34;',
    'plateMix = 0.18 + bloom * 0.14;',
    `${stereoDryWetProcess(input, wetChain)};`,
  ].join('\n');
}

function emitHallBloom(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, HALL_BLOOM_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_ <: _,_';
  const spread = reverbSpread(spec.qualityProfile) + 16;
  const wetChain = `par(i,2,*(input_gain)) : par(i,2,fi.lowpass(2, airCut)) : par(i,2,ef.echo(0.4, predelayTime, 0.02 + bloom * 0.06)) : re.stereo_freeverb(hallSize, bloomVerb, hallDamp, ${spread})`;

  return [
    'import("stdfaust.lib");',
    'mix = hslider("mix", 0.54, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'predelayTime = 0.02 + preDelay * 0.12;',
    'airCut = 6400 - damping * 2800;',
    'hallSize = 0.78 + space * 0.16;',
    'hallDamp = 0.18 + damping * 0.28;',
    'bloomVerb = 0.56 + bloom * 0.18;',
    `${stereoDryWetProcess(input, wetChain)};`,
  ].join('\n');
}

function emitMicroshiftWidener(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, MICROSHIFT_WIDENER_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_ <: _,_';
  const wetChain = 'par(i,2,*(input_gain)) : par(i,2,fi.lowpass(2, tone)) : pf.flanger_stereo(2048, leftDelay, rightDelay, depth, 0.0, 0) : par(i,2,*(duck))';

  return [
    'import("stdfaust.lib");',
    'mix = hslider("mix", 0.42, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'baseDelay = 120 + width * 540;',
    'leftDelay = baseDelay + os.osc(0.08 + modRate * 0.28) * (8 + modDepth * 44);',
    'rightDelay = baseDelay * 1.17 + os.osc(0.11 + modRate * 0.32) * (10 + modDepth * 52);',
    'depth = 0.06 + modDepth * 0.22;',
    'duck = 1.0 - ducking * 0.18;',
    'tone = 3800 + brightness * 2600;',
    `${stereoDryWetProcess(input, wetChain)};`,
  ].join('\n');
}

function emitModulatedEchoVerb(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, MODULATED_ECHO_VERB_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_ <: _,_';
  const spread = reverbSpread(spec.qualityProfile) + 4;
  const wetChain = `par(i,2,*(input_gain)) : par(i,2,fi.lowpass(2, toneCut)) : par(i,2,ef.echo(1.4, delayTime, delayFb)) : re.stereo_freeverb(verbSize, 0.54, verbDamp, ${spread})`;

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 0.5, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'delayTime = 0.18 + space * 0.42 + os.osc(0.05 + modRate * 0.22) * (0.004 + modDepth * 0.012);',
    'delayFb = 0.22 + bloom * 0.34;',
    'toneCut = 2200 + feedbackTone * 4200;',
    'verbSize = 0.66 + bloom * 0.16;',
    'verbDamp = 0.18 + (1.0 - feedbackTone) * 0.24;',
    `${stereoDryWetProcess(input, wetChain)};`,
  ].join('\n');
}

function emitDarkMotionVerb(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, DARK_MOTION_VERB_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_ <: _,_';
  const spread = reverbSpread(spec.qualityProfile) + 12;
  const wetChain = `par(i,2,*(input_gain)) : par(i,2,fi.lowpass(2, motionCut)) : par(i,2,ef.echo(0.5, shadowDelay, 0.08 + bloom * 0.14)) : re.stereo_freeverb(verbSize, 0.5 + bloom * 0.08, verbDamp, ${spread})`;

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 0.5, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'motionCut = 2800 - damping * 1400 + os.osc(0.07 + movement * 0.22) * (140 + modDepth * 420);',
    'verbSize = 0.68 + space * 0.18;',
    'verbDamp = 0.24 + damping * 0.32;',
    'shadowDelay = 0.09 + movement * 0.08;',
    `${stereoDryWetProcess(input, wetChain)};`,
  ].join('\n');
}

function emitTempoEcho(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, TEMPO_ECHO_MACROS);
  const monoChain = [
    'modDelay = 0.22 + movement * 0.07 + os.osc(0.08 + movement * 0.15) * 0.012;',
    'filtered = _ : fi.lowpass(2, 4200 - character * 2500);',
    `wet = filtered : ef.echo(${premiumMultiplier(spec.qualityProfile, 1.5, 1.2)}, modDelay, 0.28 + space * 0.55) : ef.cubicnl(0.02 + character * 0.16, 0.0);`,
    'process = _ <: (*(1.0 - mix)), (wet : *(mix)) : +;',
  ];

  const stereoChain = [
    `${stereoDryWetProcess('_,_', `par(i,2,*(input_gain)) : par(i,2,fi.lowpass(2, 4200 - character * 2500)) : par(i,2,ef.echo(${premiumMultiplier(spec.qualityProfile, 1.5, 1.2)}, 0.22 + movement * 0.08, 0.28 + space * 0.55))`)};`,
  ];

  return [
    'import("stdfaust.lib");',
    'mix = hslider("mix", 0.42, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    ...(spec.io.inputs === 2 ? stereoChain : monoChain),
  ].join('\n');
}

function emitChorusReverb(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, CHORUS_REVERB_MACROS);
  const spread = reverbSpread(spec.qualityProfile) + (spec.stereoProfile === 'wide' ? 22 : 0);
  const input = spec.io.inputs === 2 ? '_,_' : '_ <: _,_';
  const wetChain = `par(i,2,*(input_gain)) : pf.flanger_stereo(4096, leftDelay, rightDelay, depth, fb, 0) : re.stereo_freeverb(0.74 + space * 0.18, 0.58, damp, ${spread})`;

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 0.5, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'baseDelay = 320 + width * 900;',
    'leftDelay = baseDelay + os.osc(0.12 + movement * 0.25) * (40 + movement * 120);',
    'rightDelay = baseDelay * 1.18 + os.osc(0.17 + movement * 0.31) * (50 + movement * 150);',
    'depth = 0.35 + width * 0.45;',
    'fb = 0.04 + character * 0.18;',
    'damp = 0.12 + (1.0 - brightness) * 0.35;',
    `${stereoDryWetProcess(input, wetChain)};`,
  ].join('\n');
}

function emitTapeSaturator(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, TAPE_SATURATOR_MACROS);

  if (spec.io.inputs === 2) {
    return [
      'import("stdfaust.lib");',
      'mix = hslider("mix", 0.56, 0, 1, 0.01);',
      'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
      ...macros,
      'preTone = fi.highpass(2, 28 + body * 44) : fi.lowpass(2, 7200 - brightness * 2600);',
      'wetTone = fi.lowpass(2, 6200 - character * 2200);',
      'sat = ef.cubicnl(0.08 + drive * 0.52, 0.0);',
      `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,preTone) : par(i,2,sat) : par(i,2,wetTone)')};`,
    ].join('\n');
  }

  return [
    'import("stdfaust.lib");',
    'mix = hslider("mix", 0.56, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'pre = _ * input_gain : fi.highpass(2, 28 + body * 44) : fi.lowpass(2, 7200 - brightness * 2600);',
    'wet = pre : ef.cubicnl(0.08 + drive * 0.52, 0.0) : fi.lowpass(2, 6200 - character * 2200);',
    'process = _ <: (*(1.0 - mix)), (wet : *(mix)) : +;',
  ].join('\n');
}

function emitAnalogLadderFilter(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, ANALOG_LADDER_FILTER_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_';

  return [
    'import("stdfaust.lib");',
    'mix = hslider("mix", 0.58, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'cutoff = 320 + brightness * 7200;',
    'res = 0.7 + resonanceShape * 2.0;',
    'preSat = 0.03 + saturationPre * 0.22;',
    'postSat = 0.02 + saturationPost * 0.18;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,ef.cubicnl(preSat, 0.0)) : par(i,2,fi.resonlp(cutoff, res, 0.9)) : par(i,2,ef.cubicnl(postSat, 0.0))')};`
      : `${monoDryWetProcess('_ * input_gain : ef.cubicnl(preSat, 0.0) : fi.resonlp(cutoff, res, 0.9) : ef.cubicnl(postSat, 0.0)')};`,
  ].join('\n');
}

function emitDriveFilterBus(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, DRIVE_FILTER_BUS_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_';

  return [
    'import("stdfaust.lib");',
    'mix = hslider("mix", 0.62, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'toneCut = 540 + brightness * 6400;',
    'preSat = 0.05 + saturationPre * 0.3 + drive * 0.18;',
    'postSat = 0.03 + saturationPost * 0.22;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,fi.highpass(2, 30 + body * 50)) : par(i,2,ef.cubicnl(preSat, 0.0)) : par(i,2,fi.lowpass(2, toneCut)) : par(i,2,ef.softclipQuadratic(postSat))')};`
      : `${monoDryWetProcess('_ * input_gain : fi.highpass(2, 30 + body * 50) : ef.cubicnl(preSat, 0.0) : fi.lowpass(2, toneCut) : ef.softclipQuadratic(postSat)')};`,
  ].join('\n');
}

function emitSurgicalToneFilter(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, SURGICAL_TONE_FILTER_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_';

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 0.5, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'lowCut = 30 + tracking * 220;',
    'highCut = 2600 + brightness * 9200;',
    'notchRes = 0.8 + notchAmount * 1.8;',
    'notchCenter = 900 + sweepRange * 4200;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,fi.highpass(2, lowCut)) : par(i,2,fi.lowpass(2, highCut)) : par(i,2,bandpassQ(notchCenter, notchRes))')};`
      : `${monoDryWetProcess('_ * input_gain : fi.highpass(2, lowCut) : fi.lowpass(2, highCut) : bandpassQ(notchCenter, notchRes)')};`,
  ].join('\n');
}

function emitFormantSweeper(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, FORMANT_SWEEPER_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_';

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 0.58, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'vowelA = 500 + vowelShift * 1200;',
    'vowelB = 1400 + vowelShift * 1800;',
    'motion = os.osc(0.12 + movement * 0.48) * (120 + movement * 880);',
    'resA = 0.8 + resonanceShape * 1.4;',
    'resB = 0.9 + resonanceShape * 1.9;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,bandpassQ(vowelA + motion, resA)) : par(i,2,bandpassQ(vowelB - motion * 0.35, resB)) : par(i,2,ef.cubicnl(0.04 + character * 0.16, 0.0))')};`
      : `${monoDryWetProcess('_ * input_gain : bandpassQ(vowelA + motion, resA) : bandpassQ(vowelB - motion * 0.35, resB) : ef.cubicnl(0.04 + character * 0.16, 0.0)')};`,
  ].join('\n');
}

function emitResonantMotionFilter(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, RESONANT_MOTION_FILTER_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_';

  return [
    'import("stdfaust.lib");',
    'mix = hslider("mix", 0.6, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'baseCut = 260 + brightness * 5200;',
    'sweep = 90 + sweepRange * 2600;',
    'mod = os.osc(0.08 + movement * 0.42) * sweep;',
    'res = 0.8 + resonanceShape * 1.8;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,fi.resonlp(baseCut + mod, res, 0.9)) : par(i,2,fi.lowpass(2, 7600))')};`
      : `${monoDryWetProcess('_ * input_gain : fi.resonlp(baseCut + mod, res, 0.9) : fi.lowpass(2, 7600)')};`,
  ].join('\n');
}

function emitWahTextureFilter(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, WAH_TEXTURE_FILTER_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_';

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 0.62, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'wahCenter = 420 + sweepRange * 3200;',
    'wahMove = os.osc(0.18 + movement * 0.85) * (140 + sweepRange * 520);',
    'wahRes = 0.9 + resonanceShape * 1.6;',
    'growl = 0.04 + character * 0.18;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,bandpassQ(wahCenter + wahMove, wahRes)) : par(i,2,ef.cubicnl(growl, 0.0)) : par(i,2,fi.highpass(2, 36 + body * 80))')};`
      : `${monoDryWetProcess('_ * input_gain : bandpassQ(wahCenter + wahMove, wahRes) : ef.cubicnl(growl, 0.0) : fi.highpass(2, 36 + body * 80)')};`,
  ].join('\n');
}

function emitEq3BandMusical(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, EQ_3BAND_MUSICAL_MACROS);
  const input = spec.io.inputs === 2 ? '_,_' : '_';

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 1.0, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'lowGain = 0.55 + low * 1.1;',
    'midGain = 0.55 + mid * 1.0;',
    'highGain = 0.55 + high * 1.1;',
    'presenceGain = 0.4 + presence * 0.9;',
    'trimGain = 0.6 + trim * 0.8;',
    'midFreq = 550 + presence * 2200;',
    'midQ = 0.8 + presence * 1.6;',
    'eq(x) = ((x * 0.34) + ((x : fi.lowpass(2, 220 + low * 420)) * lowGain) + ((x : bandpassQ(midFreq, midQ)) * midGain * 0.45) + ((x : fi.highpass(2, 2400 + presence * 2200)) * highGain * 0.36) + ((x : bandpassQ(3000 + presence * 2400, 1.2 + presence * 1.8)) * presenceGain * 0.18)) * trimGain;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,eq)')};`
      : `${monoDryWetProcess('_ * input_gain : eq')};`,
  ].join('\n');
}

function emitEq5BandParametric(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, EQ_5BAND_PARAMETRIC_MACROS);

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 1.0, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'lowGain = 0.5 + low * 1.05;',
    'lowMidGain = 0.45 + lowMid * 1.05;',
    'midGain = 0.45 + mid * 1.05;',
    'presenceGain = 0.45 + presence * 1.05;',
    'airGain = 0.45 + air * 1.1;',
    'trimGain = 0.6 + trim * 0.8;',
    'eq(x) = ((x * 0.22) + ((x : fi.lowpass(2, 160 + low * 300)) * lowGain) + ((x : bandpassQ(260 + lowMid * 620, 0.8 + lowMid * 1.4)) * lowMidGain * 0.34) + ((x : bandpassQ(900 + mid * 1800, 0.9 + mid * 1.8)) * midGain * 0.32) + ((x : bandpassQ(2600 + presence * 2400, 1.1 + presence * 1.8)) * presenceGain * 0.22) + ((x : fi.highpass(2, 4200 + air * 2600)) * airGain * 0.18)) * trimGain;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,eq)')};`
      : `${monoDryWetProcess('_ * input_gain : eq')};`,
  ].join('\n');
}

function emitEqTiltPresence(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, EQ_TILT_PRESENCE_MACROS);

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 1.0, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'lowGain = 0.7 + weight * 0.9;',
    'highGain = 0.7 + clarity * 0.9;',
    'airGain = 0.4 + air * 1.0;',
    'trimGain = 0.6 + trim * 0.8;',
    'eq(x) = ((x * 0.4) + ((x : fi.lowpass(2, 240 + weight * 340)) * lowGain * 0.45) + ((x : fi.highpass(2, 1800 + clarity * 1800)) * highGain * 0.28) + ((x : fi.highpass(2, 5200 + air * 2600)) * airGain * 0.18)) * trimGain;',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,eq)')};`
      : `${monoDryWetProcess('_ * input_gain : eq')};`,
  ].join('\n');
}

function emitEqResonantCreative(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, EQ_RESONANT_CREATIVE_MACROS);

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'mix = hslider("mix", 1.0, 0, 1, 0.01);',
    'input_gain = hslider("input gain", 1.0, 0, 2, 0.01);',
    ...macros,
    'weightGain = 0.7 + weight * 0.95;',
    'colorDrive = 0.02 + color * 0.18;',
    'resQ = 1.0 + resonance * 3.2;',
    'airGain = 0.35 + air * 0.95;',
    'trimGain = 0.6 + trim * 0.8;',
    'eq(x) = ((((x * 0.34) + ((x : fi.lowpass(2, 220 + weight * 360)) * weightGain * 0.5) + ((x : bandpassQ(900 + color * 2600, resQ)) * (0.16 + resonance * 0.52)) + ((x : fi.highpass(2, 4200 + air * 2600)) * airGain * 0.16)) : ef.cubicnl(colorDrive, 0.0)) * trimGain);',
    spec.io.inputs === 2
      ? `${stereoDryWetProcess('_,_', 'par(i,2,*(input_gain)) : par(i,2,eq)')};`
      : `${monoDryWetProcess('_ * input_gain : eq')};`,
  ].join('\n');
}

function emitImpactHit(spec: PluginSpec): string {
  const macros = linesForMacros(spec.macroControls, IMPACT_HIT_MACROS);
  const stereo = spec.io.outputs === 2 ? ': sp.panner(0.5)' : '';

  return [
    'import("stdfaust.lib");',
    BANDPASS_Q_HELPER,
    'freq = hslider("freq [Hz]", 150, 20, 4000, 1);',
    'gain = hslider("gain", 0.82, 0, 1, 0.01);',
    'trigger = button("trigger");',
    ...macros,
    'bodyEnv = en.ar(0.001 + (1.0 - punch) * 0.01, 0.18 + body * 0.36, trigger);',
    'snapEnv = en.ar(0.0005, 0.04 + (1.0 - punch) * 0.06, trigger);',
    'core = os.triangle(freq * (0.85 + body * 0.4)) * bodyEnv;',
    'snap = no.pink_noise * snapEnv * (0.18 + brightness * 0.24);',
    'air = os.square(freq * (2.0 + brightness * 1.8)) * snapEnv * (0.04 + character * 0.08);',
    'pre = (core + snap + air) * gain * 0.78;',
    'shaped = pre : fi.highpass(4, 32 + body * 60) : bandpassQ(700 + brightness * 2600, 1.2 + character * 2.4) : ef.softclipQuadratic(0.18 + character * 0.34);',
    `process = shaped${stereo};`,
  ].join('\n');
}

export const TEMPLATE_REGISTRY: Record<Exclude<VoiceArchitecture, 'custom_graph'>, TemplateDefinition> = {
  mono_bass: {
    id: 'mono_bass',
    supportedKinds: ['synth'],
    requiredMacros: ['brightness', 'body', 'drive', 'punch', 'movement'],
    allowedToneModels: ['analog_warm', 'clean_precise', 'tape_vintage', 'modern_wide'],
    allowedStereoProfiles: ['mono', 'stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'mono',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'analog_warm', macros: MONO_BASS_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'instrument_modern',
      preferredUiStyle: 'boutique_hardware',
      heroControls: ['brightness', 'body', 'drive'],
      defaultSections: [
        section('main', 'Main', 'row', ['brightness', 'body', 'drive']),
        section('shape', 'Shape', 'row', ['punch', 'movement']),
      ],
      defaultVisualizers: [{ type: 'macro_orb', placement: 'center' }, { type: 'envelope', placement: 'sidebar' }],
      defaultMeters: ['output'],
      sidebar: true,
      accent: 'ember',
      surface: 'obsidian',
      glow: 0.22,
    }),
    scalingNotes: [
      'brightness controls resonant low-pass cutoff and resonance',
      'body controls sub oscillator weight and sustain',
      'drive controls harmonic edge and nonlinear saturation',
      'punch tightens attack, decay, and release',
    ],
    evaluationExpectations: [
      { metric: 'peak_db', target: 'max', value: -0.5, rationale: 'bass patch should maintain headroom' },
      { metric: 'rms', target: 'min', value: -18, rationale: 'bass should feel solid, not weak' },
    ],
    emit: emitMonoBass,
  },
  supersaw_pad: {
    id: 'supersaw_pad',
    supportedKinds: ['synth'],
    requiredMacros: ['brightness', 'movement', 'space', 'width', 'character'],
    allowedToneModels: ['analog_warm', 'modern_wide', 'lush_spacious', 'dark_ambient'],
    allowedStereoProfiles: ['stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'wide',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'lush_spacious', macros: SUPERSAW_PAD_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'instrument_modern',
      preferredUiStyle: 'soft_ambient',
      heroControls: ['space', 'width', 'movement'],
      defaultSections: [
        section('hero', 'Hero', 'row', ['space', 'width', 'movement']),
        section('tone', 'Tone', 'row', ['brightness', 'character']),
      ],
      defaultVisualizers: [{ type: 'macro_orb', placement: 'header' }, { type: 'envelope', placement: 'center' }],
      defaultMeters: ['output', 'width'],
      sidebar: true,
      accent: 'ice',
      surface: 'mist',
      glow: 0.38,
    }),
    scalingNotes: [
      'width spreads detune asymmetrically across left/right voices',
      'space lengthens release and deepens reverb',
      'movement modulates cutoff and reverb damping',
    ],
    evaluationExpectations: [
      { metric: 'stereo_correlation', target: 'range', min: 0.05, max: 0.85, rationale: 'pad should be wide but not phase-collapsed' },
      { metric: 'decay_ms', target: 'min', value: 1200, rationale: 'pad should bloom and sustain' },
    ],
    emit: emitSupersawPad,
  },
  velvet_pluck: {
    id: 'velvet_pluck',
    supportedKinds: ['synth'],
    requiredMacros: ['brightness', 'punch', 'body', 'space', 'character'],
    allowedToneModels: ['analog_warm', 'clean_precise', 'tape_vintage', 'modern_wide'],
    allowedStereoProfiles: ['mono', 'stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'clean_precise', macros: VELVET_PLUCK_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'instrument_modern',
      preferredUiStyle: 'modern_bold',
      heroControls: ['punch', 'brightness', 'space'],
      defaultSections: [
        section('main', 'Main', 'row', ['punch', 'brightness', 'space']),
        section('detail', 'Detail', 'row', ['body', 'character']),
      ],
      defaultVisualizers: [{ type: 'envelope', placement: 'center' }, { type: 'macro_orb', placement: 'footer' }],
      defaultMeters: ['output'],
      accent: 'sunset',
      glow: 0.3,
    }),
    scalingNotes: [
      'punch sharpens attack and shortens the pluck decay',
      'space adds tasteful room and short echo bloom',
      'character enriches upper harmonics without turning harsh',
    ],
    evaluationExpectations: [
      { metric: 'peak_db', target: 'max', value: -0.8, rationale: 'plucks should remain punchy without clipping' },
      { metric: 'decay_ms', target: 'range', min: 180, max: 1800, rationale: 'plucks should decay quickly but musically' },
    ],
    emit: emitVelvetPluck,
  },
  stereo_lead: {
    id: 'stereo_lead',
    supportedKinds: ['synth'],
    requiredMacros: ['brightness', 'width', 'drive', 'movement', 'character'],
    allowedToneModels: ['analog_warm', 'modern_wide', 'clean_precise', 'tape_vintage'],
    allowedStereoProfiles: ['mono', 'stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'modern_wide', macros: STEREO_LEAD_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'instrument_modern',
      preferredUiStyle: 'modern_bold',
      heroControls: ['brightness', 'width', 'drive'],
      defaultSections: [
        section('hero', 'Hero', 'row', ['brightness', 'width', 'drive']),
        section('motion', 'Motion', 'row', ['movement', 'character']),
      ],
      defaultVisualizers: [{ type: 'macro_orb', placement: 'center' }, { type: 'envelope', placement: 'sidebar' }],
      defaultMeters: ['output', 'width'],
      sidebar: true,
      accent: 'violet',
      glow: 0.34,
    }),
    scalingNotes: [
      'width introduces subtle detune asymmetry for premium stereo presence',
      'movement drives vibrato and filter animation',
      'drive and character shape forwardness without collapsing headroom',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 1200, max: 6500, rationale: 'lead should stay bright and present without becoming piercing' },
      { metric: 'rms', target: 'min', value: -20, rationale: 'lead should sit forward in the mix' },
    ],
    emit: emitStereoLead,
  },
  plate_space: {
    id: 'plate_space',
    supportedKinds: ['effect'],
    requiredMacros: ['space', 'diffusion', 'damping', 'preDelay', 'bloom'],
    allowedToneModels: ['lush_spacious', 'clean_precise', 'modern_wide', 'dark_ambient'],
    allowedStereoProfiles: ['stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'lush_spacious', macros: PLATE_SPACE_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'space_fx',
      preferredUiStyle: 'soft_ambient',
      heroControls: ['space', 'bloom', 'diffusion'],
      defaultSections: [
        section('main', 'Main', 'row', ['space', 'bloom', 'diffusion']),
        section('tone', 'Tone', 'row', ['damping', 'preDelay']),
      ],
      defaultVisualizers: [{ type: 'stereo_field', placement: 'header' }, { type: 'decay_meter', placement: 'center' }],
      defaultMeters: ['input', 'output', 'width'],
      sidebar: true,
      accent: 'ice',
      surface: 'mist',
      glow: 0.42,
    }),
    scalingNotes: [
      'diffusion controls density and smoothness of the plate field',
      'preDelay separates the dry transient from the bloom',
      'damping and bloom balance brightness against tail thickness',
    ],
    evaluationExpectations: [
      { metric: 'stereo_correlation', target: 'range', min: 0.02, max: 0.7, rationale: 'plate should sound wide but remain mixable' },
      { metric: 'decay_ms', target: 'range', min: 900, max: 3200, rationale: 'plate tails should bloom quickly without becoming endless' },
      { metric: 'spectral_centroid_hz', target: 'range', min: 900, max: 5600, rationale: 'plate should stay bright yet controlled' },
    ],
    emit: emitPlateSpace,
  },
  hall_bloom: {
    id: 'hall_bloom',
    supportedKinds: ['effect'],
    requiredMacros: ['space', 'diffusion', 'damping', 'preDelay', 'bloom'],
    allowedToneModels: ['lush_spacious', 'dark_ambient', 'modern_wide'],
    allowedStereoProfiles: ['stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'wide',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'lush_spacious', macros: HALL_BLOOM_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'space_fx',
      preferredUiStyle: 'soft_ambient',
      heroControls: ['space', 'bloom', 'preDelay'],
      defaultSections: [
        section('hero', 'Hero', 'row', ['space', 'bloom', 'preDelay']),
        section('texture', 'Texture', 'row', ['diffusion', 'damping']),
      ],
      defaultVisualizers: [{ type: 'stereo_field', placement: 'header' }, { type: 'decay_meter', placement: 'center' }],
      defaultMeters: ['input', 'output', 'width'],
      sidebar: true,
      accent: 'steel',
      surface: 'mist',
      glow: 0.4,
    }),
    scalingNotes: [
      'space and bloom push the hall toward cinematic size and tail thickness',
      'preDelay gives the onset more depth and separation',
      'damping reins in the top-end as the hall gets larger',
    ],
    evaluationExpectations: [
      { metric: 'stereo_correlation', target: 'range', min: -0.05, max: 0.68, rationale: 'hall should feel broad and immersive while remaining stable' },
      { metric: 'decay_ms', target: 'range', min: 1600, max: 4800, rationale: 'hall tails should be distinctly longer than plate tails' },
      { metric: 'spectral_centroid_hz', target: 'range', min: 700, max: 4200, rationale: 'hall should stay smoother and darker than a bright plate' },
    ],
    emit: emitHallBloom,
  },
  microshift_widener: {
    id: 'microshift_widener',
    supportedKinds: ['effect'],
    requiredMacros: ['width', 'modDepth', 'modRate', 'brightness', 'ducking'],
    allowedToneModels: ['modern_wide', 'clean_precise', 'lush_spacious'],
    allowedStereoProfiles: ['stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'wide',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'modern_wide', macros: MICROSHIFT_WIDENER_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'color_fx',
      preferredUiStyle: 'minimal_precision',
      heroControls: ['width', 'modDepth', 'ducking'],
      defaultSections: [
        section('main', 'Main', 'row', ['width', 'modDepth', 'ducking']),
        section('motion', 'Motion', 'row', ['modRate', 'brightness']),
      ],
      defaultVisualizers: [{ type: 'stereo_field', placement: 'center' }],
      defaultMeters: ['input', 'output', 'width'],
      sidebar: false,
      accent: 'steel',
      glow: 0.24,
    }),
    scalingNotes: [
      'width and modDepth widen the image through short modulated delay offsets',
      'ducking keeps the widener from washing over dry transients',
      'brightness trims the top-end softness of the shifted signal',
    ],
    evaluationExpectations: [
      { metric: 'stereo_correlation', target: 'range', min: 0.15, max: 0.82, rationale: 'widener should feel broad without severe mono collapse' },
      { metric: 'decay_ms', target: 'range', min: 60, max: 900, rationale: 'widener should stay subtle and not smear into long tails' },
    ],
    emit: emitMicroshiftWidener,
  },
  modulated_echo_verb: {
    id: 'modulated_echo_verb',
    supportedKinds: ['effect'],
    requiredMacros: ['space', 'feedbackTone', 'modDepth', 'modRate', 'bloom'],
    allowedToneModels: ['tape_vintage', 'lush_spacious', 'modern_wide', 'dark_ambient'],
    allowedStereoProfiles: ['stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'tape_vintage', macros: MODULATED_ECHO_VERB_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'space_fx',
      preferredUiStyle: 'boutique_hardware',
      heroControls: ['space', 'bloom', 'feedbackTone'],
      defaultSections: [
        section('hero', 'Hero', 'row', ['space', 'bloom', 'feedbackTone']),
        section('motion', 'Motion', 'row', ['modDepth', 'modRate']),
      ],
      defaultVisualizers: [{ type: 'decay_meter', placement: 'center' }, { type: 'stereo_field', placement: 'header' }],
      defaultMeters: ['input', 'output', 'width'],
      sidebar: true,
      accent: 'sunset',
      surface: 'obsidian',
      glow: 0.32,
    }),
    scalingNotes: [
      'feedbackTone shapes the darkness and softness of repeats',
      'modDepth and modRate animate the delay path without destabilizing it',
      'bloom expands the reverb tail fed by the repeats',
    ],
    evaluationExpectations: [
      { metric: 'stereo_correlation', target: 'range', min: -0.05, max: 0.72, rationale: 'modulated delay verb should stay spacious without losing the center' },
      { metric: 'decay_ms', target: 'range', min: 700, max: 4200, rationale: 'echo-verb tails should feel lush but remain bounded' },
      { metric: 'spectral_centroid_hz', target: 'range', min: 700, max: 4800, rationale: 'repeats should stay polished rather than brittle' },
    ],
    emit: emitModulatedEchoVerb,
  },
  dark_motion_verb: {
    id: 'dark_motion_verb',
    supportedKinds: ['effect'],
    requiredMacros: ['space', 'damping', 'movement', 'modDepth', 'bloom'],
    allowedToneModels: ['dark_ambient', 'lush_spacious', 'tape_vintage'],
    allowedStereoProfiles: ['stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'wide',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'dark_ambient', macros: DARK_MOTION_VERB_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'space_fx',
      preferredUiStyle: 'soft_ambient',
      heroControls: ['space', 'movement', 'bloom'],
      defaultSections: [
        section('hero', 'Hero', 'row', ['space', 'movement', 'bloom']),
        section('shadow', 'Shadow', 'row', ['damping', 'modDepth']),
      ],
      defaultVisualizers: [{ type: 'stereo_field', placement: 'header' }, { type: 'decay_meter', placement: 'center' }],
      defaultMeters: ['input', 'output', 'width'],
      sidebar: true,
      accent: 'violet',
      surface: 'obsidian',
      glow: 0.36,
    }),
    scalingNotes: [
      'movement and modDepth animate the dark tail without turning it into chorus',
      'damping sets how shadowy and muffled the ambience becomes',
      'bloom thickens the tail while keeping the center subdued',
    ],
    evaluationExpectations: [
      { metric: 'stereo_correlation', target: 'range', min: -0.08, max: 0.7, rationale: 'dark motion reverb should stay enveloping without washing out the center' },
      { metric: 'decay_ms', target: 'range', min: 1200, max: 3800, rationale: 'dark tails should linger, but not as long as a huge hall' },
      { metric: 'spectral_centroid_hz', target: 'range', min: 450, max: 2600, rationale: 'dark motion reverb should read distinctly darker than other spatial families' },
    ],
    emit: emitDarkMotionVerb,
  },
  tempo_echo: {
    id: 'tempo_echo',
    supportedKinds: ['effect'],
    requiredMacros: ['space', 'movement', 'character', 'width'],
    allowedToneModels: ['clean_precise', 'tape_vintage', 'modern_wide'],
    allowedStereoProfiles: ['mono', 'stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'standard',
    defaults: { toneModel: 'tape_vintage', macros: TEMPO_ECHO_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'color_fx',
      preferredUiStyle: 'boutique_hardware',
      heroControls: ['space', 'character', 'movement'],
      defaultSections: [
        section('main', 'Main', 'row', ['space', 'character', 'movement']),
        section('spread', 'Spread', 'row', ['width']),
      ],
      defaultVisualizers: [{ type: 'macro_orb', placement: 'center' }],
      defaultMeters: ['input', 'output'],
      accent: 'sunset',
      surface: 'graphite',
      glow: 0.22,
    }),
    scalingNotes: [
      'space controls feedback depth',
      'character darkens the repeats and adds light saturation',
      'movement adds subtle delay-time modulation',
    ],
    evaluationExpectations: [
      { metric: 'decay_ms', target: 'range', min: 250, max: 2500, rationale: 'echo tail should be audible but bounded' },
    ],
    emit: emitTempoEcho,
  },
  chorus_reverb: {
    id: 'chorus_reverb',
    supportedKinds: ['effect'],
    requiredMacros: ['space', 'movement', 'width', 'character', 'brightness'],
    allowedToneModels: ['lush_spacious', 'modern_wide', 'dark_ambient'],
    allowedStereoProfiles: ['stereo', 'wide'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'wide',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'lush_spacious', macros: CHORUS_REVERB_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'space_fx',
      preferredUiStyle: 'soft_ambient',
      heroControls: ['space', 'width', 'movement'],
      defaultSections: [
        section('hero', 'Hero', 'row', ['space', 'width', 'movement']),
        section('tone', 'Tone', 'row', ['character', 'brightness']),
      ],
      defaultVisualizers: [{ type: 'stereo_field', placement: 'header' }, { type: 'decay_meter', placement: 'center' }],
      defaultMeters: ['input', 'output', 'width'],
      sidebar: true,
      accent: 'ice',
      surface: 'mist',
      glow: 0.4,
    }),
    scalingNotes: [
      'width controls chorus delay spread and stereo image',
      'space controls reverb size and decay perception',
      'brightness controls damping in the reverb tail',
    ],
    evaluationExpectations: [
      { metric: 'stereo_correlation', target: 'range', min: -0.1, max: 0.75, rationale: 'spatial effect should be wide without collapsing mono entirely' },
      { metric: 'spectral_centroid_hz', target: 'range', min: 800, max: 5000, rationale: 'chorus verb should stay airy but not piercing' },
    ],
    emit: emitChorusReverb,
  },
  tape_saturator: {
    id: 'tape_saturator',
    supportedKinds: ['effect'],
    requiredMacros: ['drive', 'character', 'body', 'brightness'],
    allowedToneModels: ['tape_vintage', 'analog_warm', 'clean_precise'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'tape_vintage', macros: TAPE_SATURATOR_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'color_fx',
      preferredUiStyle: 'boutique_hardware',
      heroControls: ['drive', 'body', 'brightness'],
      defaultSections: [
        section('main', 'Main', 'row', ['drive', 'body', 'brightness']),
        section('color', 'Color', 'row', ['character']),
      ],
      defaultVisualizers: [{ type: 'drive_meter', placement: 'center' }],
      defaultMeters: ['input', 'output'],
      accent: 'ember',
      surface: 'obsidian',
      glow: 0.26,
    }),
    scalingNotes: [
      'drive raises harmonic density while preserving mix-safe headroom',
      'body tunes low-mid weight before saturation',
      'brightness sets the tape-style high-frequency rolloff',
    ],
    evaluationExpectations: [
      { metric: 'peak_db', target: 'max', value: -0.3, rationale: 'saturator should stay mix-safe even when pushed' },
      { metric: 'spectral_centroid_hz', target: 'range', min: 500, max: 5200, rationale: 'color effect should stay warm and controlled' },
    ],
    emit: emitTapeSaturator,
  },
  analog_ladder_filter: {
    id: 'analog_ladder_filter',
    supportedKinds: ['effect'],
    requiredMacros: ['brightness', 'resonanceShape', 'tracking', 'saturationPre', 'saturationPost'],
    allowedToneModels: ['analog_warm', 'tape_vintage', 'modern_wide'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'analog_warm', macros: ANALOG_LADDER_FILTER_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'motion_filter',
      preferredUiStyle: 'boutique_hardware',
      heroControls: ['brightness', 'resonanceShape', 'tracking'],
      defaultSections: [
        section('filter', 'Filter', 'row', ['brightness', 'resonanceShape', 'tracking']),
        section('drive', 'Drive', 'row', ['saturationPre', 'saturationPost']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }, { type: 'drive_meter', placement: 'sidebar' }],
      defaultMeters: ['input', 'output'],
      sidebar: true,
      accent: 'ember',
      surface: 'obsidian',
      glow: 0.24,
    }),
    scalingNotes: [
      'resonanceShape sets how forward and rounded the ladder peak feels',
      'saturationPre and saturationPost create controlled color around the filter',
      'brightness and tracking keep the filter musical rather than shrill',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 500, max: 5200, rationale: 'ladder filter should stay warm and musical' },
      { metric: 'peak_db', target: 'max', value: -0.4, rationale: 'ladder resonance should not spike into clipping' },
    ],
    emit: emitAnalogLadderFilter,
  },
  drive_filter_bus: {
    id: 'drive_filter_bus',
    supportedKinds: ['effect'],
    requiredMacros: ['drive', 'body', 'brightness', 'saturationPre', 'saturationPost'],
    allowedToneModels: ['analog_warm', 'tape_vintage', 'modern_wide'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'analog_warm', macros: DRIVE_FILTER_BUS_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'color_fx',
      preferredUiStyle: 'boutique_hardware',
      heroControls: ['drive', 'brightness', 'body'],
      defaultSections: [
        section('main', 'Main', 'row', ['drive', 'brightness', 'body']),
        section('finish', 'Finish', 'row', ['saturationPre', 'saturationPost']),
      ],
      defaultVisualizers: [{ type: 'drive_meter', placement: 'center' }],
      defaultMeters: ['input', 'output'],
      accent: 'sunset',
      surface: 'obsidian',
      glow: 0.24,
    }),
    scalingNotes: [
      'drive and saturationPre build the main color density',
      'brightness and body shape the tonal contour around the drive stage',
      'saturationPost adds a final polish rather than extra harshness',
    ],
    evaluationExpectations: [
      { metric: 'rms', target: 'min', value: -22, rationale: 'drive bus should add enough density to feel meaningful' },
      { metric: 'peak_db', target: 'max', value: -0.3, rationale: 'drive bus should remain mix-safe even when pushed' },
    ],
    emit: emitDriveFilterBus,
  },
  surgical_tone_filter: {
    id: 'surgical_tone_filter',
    supportedKinds: ['effect'],
    requiredMacros: ['brightness', 'sweepRange', 'notchAmount', 'tracking', 'character'],
    allowedToneModels: ['clean_precise', 'modern_wide', 'analog_warm'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'clean_precise', macros: SURGICAL_TONE_FILTER_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'motion_filter',
      preferredUiStyle: 'minimal_precision',
      heroControls: ['brightness', 'sweepRange', 'notchAmount'],
      defaultSections: [
        section('tone', 'Tone', 'row', ['brightness', 'sweepRange', 'notchAmount']),
        section('control', 'Control', 'row', ['tracking', 'character']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }],
      defaultMeters: ['input', 'output'],
      accent: 'steel',
      surface: 'graphite',
      glow: 0.16,
    }),
    scalingNotes: [
      'sweepRange controls how aggressively the tonal focus shifts',
      'notchAmount introduces controllable mid sculpting without dramatic resonance spikes',
      'tracking and character keep the result precise and mix-oriented',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 400, max: 6800, rationale: 'surgical filter should cover a broad but predictable tone-shaping range' },
      { metric: 'peak_db', target: 'max', value: -0.2, rationale: 'utility filters should stay very stable in peak behavior' },
    ],
    emit: emitSurgicalToneFilter,
  },
  formant_sweeper: {
    id: 'formant_sweeper',
    supportedKinds: ['effect'],
    requiredMacros: ['vowelShift', 'movement', 'resonanceShape', 'brightness', 'character'],
    allowedToneModels: ['modern_wide', 'clean_precise', 'analog_warm'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'modern_wide', macros: FORMANT_SWEEPER_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'motion_filter',
      preferredUiStyle: 'modern_bold',
      heroControls: ['vowelShift', 'movement', 'resonanceShape'],
      defaultSections: [
        section('voice', 'Voice', 'row', ['vowelShift', 'movement', 'resonanceShape']),
        section('tone', 'Tone', 'row', ['brightness', 'character']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }, { type: 'macro_orb', placement: 'center' }],
      defaultMeters: ['input', 'output'],
      accent: 'violet',
      surface: 'graphite',
      glow: 0.3,
    }),
    scalingNotes: [
      'vowelShift moves the filter formants through a talk-like spectrum',
      'movement adds animated vowel drift rather than simple LFO wobble',
      'character adds light harmonic bite so the formant stays audible in a mix',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 800, max: 5200, rationale: 'formant sweeps should stay articulate without becoming shrill' },
      { metric: 'peak_db', target: 'max', value: -0.25, rationale: 'expressive formants should remain stable under resonance' },
    ],
    emit: emitFormantSweeper,
  },
  resonant_motion_filter: {
    id: 'resonant_motion_filter',
    supportedKinds: ['effect'],
    requiredMacros: ['movement', 'resonanceShape', 'sweepRange', 'brightness', 'tracking'],
    allowedToneModels: ['analog_warm', 'modern_wide', 'dark_ambient'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'analog_warm', macros: RESONANT_MOTION_FILTER_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'motion_filter',
      preferredUiStyle: 'modern_bold',
      heroControls: ['movement', 'resonanceShape', 'sweepRange'],
      defaultSections: [
        section('motion', 'Motion', 'row', ['movement', 'resonanceShape', 'sweepRange']),
        section('tone', 'Tone', 'row', ['brightness', 'tracking']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }, { type: 'macro_orb', placement: 'center' }],
      defaultMeters: ['input', 'output'],
      accent: 'lime',
      surface: 'graphite',
      glow: 0.28,
    }),
    scalingNotes: [
      'movement and sweepRange create a musical animated cutoff contour',
      'resonanceShape emphasizes motion without tipping into brittle peaks',
      'tracking keeps the sweep useful across a broader tonal range',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 600, max: 6000, rationale: 'animated resonant sweeps should stay musical and controlled' },
      { metric: 'peak_db', target: 'max', value: -0.35, rationale: 'resonant motion should not produce runaway resonance spikes' },
    ],
    emit: emitResonantMotionFilter,
  },
  wah_texture_filter: {
    id: 'wah_texture_filter',
    supportedKinds: ['effect'],
    requiredMacros: ['movement', 'sweepRange', 'resonanceShape', 'character', 'body'],
    allowedToneModels: ['analog_warm', 'tape_vintage', 'modern_wide'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'analog_warm', macros: WAH_TEXTURE_FILTER_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'motion_filter',
      preferredUiStyle: 'boutique_hardware',
      heroControls: ['movement', 'sweepRange', 'character'],
      defaultSections: [
        section('wah', 'Wah', 'row', ['movement', 'sweepRange', 'character']),
        section('shape', 'Shape', 'row', ['resonanceShape', 'body']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }, { type: 'macro_orb', placement: 'center' }],
      defaultMeters: ['input', 'output'],
      accent: 'ember',
      surface: 'obsidian',
      glow: 0.28,
    }),
    scalingNotes: [
      'movement turns the filter into a performative wah-like sweep',
      'body keeps the bottom end from disappearing under the wah shape',
      'character adds growl and expression to the moving bandpass',
    ],
    evaluationExpectations: [
      { metric: 'rms', target: 'min', value: -23, rationale: 'wah textures should feel lively and forward enough to matter' },
      { metric: 'peak_db', target: 'max', value: -0.3, rationale: 'wah sweeps should stay expressive without clipping harshly' },
    ],
    emit: emitWahTextureFilter,
  },
  eq_3band_musical: {
    id: 'eq_3band_musical',
    supportedKinds: ['effect'],
    requiredMacros: ['low', 'mid', 'high', 'presence', 'trim'],
    allowedToneModels: ['analog_warm', 'clean_precise', 'modern_wide', 'tape_vintage'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'analog_warm', macros: EQ_3BAND_MUSICAL_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'color_fx',
      preferredUiStyle: 'minimal_precision',
      heroControls: ['low', 'mid', 'high'],
      defaultSections: [
        section('tone', 'Tone', 'row', ['low', 'mid', 'high']),
        section('focus', 'Focus', 'row', ['presence', 'trim']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }],
      defaultMeters: ['input', 'output'],
      sidebar: true,
      accent: 'steel',
      surface: 'graphite',
      glow: 0.2,
    }),
    scalingNotes: [
      'low, mid, and high shape broad musical tone regions',
      'presence pushes upper-mid focus without becoming surgical',
      'trim compensates output level after tonal changes',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 500, max: 6500, rationale: 'broad EQ should cover warm to bright tonal ranges' },
      { metric: 'peak_db', target: 'max', value: -0.2, rationale: 'tone EQ should remain stable and mix-safe' },
    ],
    emit: emitEq3BandMusical,
  },
  eq_5band_parametric: {
    id: 'eq_5band_parametric',
    supportedKinds: ['effect'],
    requiredMacros: ['low', 'lowMid', 'mid', 'presence', 'air', 'trim'],
    allowedToneModels: ['clean_precise', 'modern_wide', 'analog_warm'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'clean_precise', macros: EQ_5BAND_PARAMETRIC_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'color_fx',
      preferredUiStyle: 'minimal_precision',
      heroControls: ['low', 'mid', 'presence', 'air'],
      defaultSections: [
        section('tone', 'Tone', 'row', ['low', 'lowMid', 'mid']),
        section('detail', 'Detail', 'row', ['presence', 'air', 'trim']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }],
      defaultMeters: ['input', 'output'],
      sidebar: true,
      accent: 'steel',
      surface: 'graphite',
      glow: 0.18,
    }),
    scalingNotes: [
      'five-region EQ covers broader corrective and finishing moves',
      'presence and air control intelligibility and openness separately',
      'trim stabilizes output across more aggressive settings',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 450, max: 7200, rationale: 'parametric EQ should support broad tonal coverage' },
      { metric: 'peak_db', target: 'max', value: -0.2, rationale: 'parametric EQ should stay stable under multiple boosts' },
    ],
    emit: emitEq5BandParametric,
  },
  eq_tilt_presence: {
    id: 'eq_tilt_presence',
    supportedKinds: ['effect'],
    requiredMacros: ['weight', 'clarity', 'air', 'trim'],
    allowedToneModels: ['analog_warm', 'clean_precise', 'modern_wide', 'tape_vintage'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'analog_warm', macros: EQ_TILT_PRESENCE_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'color_fx',
      preferredUiStyle: 'minimal_precision',
      heroControls: ['weight', 'clarity', 'air'],
      defaultSections: [
        section('shape', 'Shape', 'row', ['weight', 'clarity', 'air']),
        section('output', 'Output', 'row', ['trim']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }],
      defaultMeters: ['input', 'output'],
      sidebar: true,
      accent: 'sunset',
      surface: 'graphite',
      glow: 0.18,
    }),
    scalingNotes: [
      'weight and clarity create fast macro tonal tilt moves',
      'air adds top-end openness without deep surgical control',
      'trim preserves level balance after broad changes',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 500, max: 7000, rationale: 'tilt EQ should swing tonal balance quickly and musically' },
      { metric: 'peak_db', target: 'max', value: -0.2, rationale: 'simple tonal shaper should remain safe under extreme use' },
    ],
    emit: emitEqTiltPresence,
  },
  eq_resonant_creative: {
    id: 'eq_resonant_creative',
    supportedKinds: ['effect'],
    requiredMacros: ['weight', 'color', 'resonance', 'air', 'trim'],
    allowedToneModels: ['analog_warm', 'modern_wide', 'dark_ambient'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'stereo',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'modern_wide', macros: EQ_RESONANT_CREATIVE_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'color_fx',
      preferredUiStyle: 'boutique_hardware',
      heroControls: ['color', 'resonance', 'weight'],
      defaultSections: [
        section('color', 'Color', 'row', ['weight', 'color', 'resonance']),
        section('finish', 'Finish', 'row', ['air', 'trim']),
      ],
      defaultVisualizers: [{ type: 'filter_curve', placement: 'header' }, { type: 'macro_orb', placement: 'center' }],
      defaultMeters: ['input', 'output'],
      sidebar: true,
      accent: 'violet',
      surface: 'obsidian',
      glow: 0.24,
    }),
    scalingNotes: [
      'color and resonance drive more characterful EQ shapes than broad tone EQs',
      'weight keeps the result grounded while resonance becomes more expressive',
      'air and trim finish the tonal contour and level',
    ],
    evaluationExpectations: [
      { metric: 'spectral_centroid_hz', target: 'range', min: 500, max: 7200, rationale: 'creative EQ should still cover useful tonal territory' },
      { metric: 'peak_db', target: 'max', value: -0.2, rationale: 'creative resonance should remain bounded and mix-safe' },
    ],
    emit: emitEqResonantCreative,
  },
  impact_hit: {
    id: 'impact_hit',
    supportedKinds: ['percussion'],
    requiredMacros: ['punch', 'body', 'brightness', 'character'],
    allowedToneModels: ['analog_warm', 'modern_wide', 'clean_precise', 'dark_ambient'],
    allowedStereoProfiles: ['mono', 'stereo'],
    allowedQualityProfiles: ['standard', 'premium'],
    defaultStereoProfile: 'mono',
    defaultQualityProfile: 'premium',
    defaults: { toneModel: 'modern_wide', macros: IMPACT_HIT_MACROS },
    ui: makeUiMetadata({
      uiFamily: 'instrument_modern',
      preferredUiStyle: 'modern_bold',
      heroControls: ['punch', 'body', 'brightness'],
      defaultSections: [
        section('impact', 'Impact', 'row', ['punch', 'body', 'brightness']),
        section('detail', 'Detail', 'row', ['character']),
      ],
      defaultVisualizers: [{ type: 'envelope', placement: 'center' }],
      defaultMeters: ['output'],
      accent: 'sunset',
      surface: 'graphite',
      glow: 0.26,
    }),
    scalingNotes: [
      'punch defines transient focus and tail compactness',
      'body shifts the hit toward weightier low mids',
      'brightness and character control snap and aggression',
    ],
    evaluationExpectations: [
      { metric: 'decay_ms', target: 'range', min: 80, max: 900, rationale: 'one-shot percussion should hit fast and clear' },
      { metric: 'rms', target: 'min', value: -19, rationale: 'impact should have enough density to feel substantial' },
    ],
    emit: emitImpactHit,
  },
};

const ARCH_KINDS: Record<VoiceArchitecture, PluginKind> = {
  mono_bass: 'synth',
  supersaw_pad: 'synth',
  velvet_pluck: 'synth',
  stereo_lead: 'synth',
  plate_space: 'effect',
  hall_bloom: 'effect',
  microshift_widener: 'effect',
  modulated_echo_verb: 'effect',
  dark_motion_verb: 'effect',
  tempo_echo: 'effect',
  chorus_reverb: 'effect',
  tape_saturator: 'effect',
  analog_ladder_filter: 'effect',
  drive_filter_bus: 'effect',
  surgical_tone_filter: 'effect',
  formant_sweeper: 'effect',
  resonant_motion_filter: 'effect',
  wah_texture_filter: 'effect',
  eq_3band_musical: 'effect',
  eq_5band_parametric: 'effect',
  eq_tilt_presence: 'effect',
  eq_resonant_creative: 'effect',
  impact_hit: 'percussion',
  custom_graph: 'synth',
};

export function getTemplateDefinition(architecture: VoiceArchitecture): TemplateDefinition | null {
  if (architecture === 'custom_graph') return null;
  return TEMPLATE_REGISTRY[architecture];
}

export function expectedKindForArchitecture(architecture: VoiceArchitecture): PluginKind {
  return ARCH_KINDS[architecture];
}

export function emitTemplateFaust(spec: PluginSpec): string | null {
  const template = getTemplateDefinition(spec.voiceArchitecture);
  return template ? template.emit(spec) : null;
}
