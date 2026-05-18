import { getTemplateDefinition, type TemplateExpectation } from './template-registry.js';
import type { MacroControl, PluginSpec } from './spec-runtime.js';

export type AnalysisMode = 'heuristic-v1' | 'essentia-v1';
export type MeasurementSource = 'heuristic' | 'essentia';

export interface MetricCheck {
  metric: TemplateExpectation['metric'];
  target: TemplateExpectation['target'];
  actual: number;
  passed: boolean;
  rationale: string;
  source: MeasurementSource;
  value?: number;
  min?: number;
  max?: number;
}

export interface MacroSnapshot {
  id: MacroControl['id'];
  init: number;
  normalized: number;
}

export interface FaustMeasuredValues {
  peakDb: number;
  rms: number;
  stereoCorrelation: number;
  spectralCentroidHz: number;
  decayMs: number;
  dcOffset: number;
  clippingRatio: number;
  silenceRatio: number;
}

export interface FaustEvaluationMetrics {
  schemaVersion: '1.0';
  analysisMode: AnalysisMode;
  compilePassed: true;
  templateId: string | null;
  measuredAt: number;
  metrics: {
    macroCoverage: number;
    parameterCount: number;
    processorCount: number;
    oscillatorCount: number;
    outputChannels: number;
    peakDb: number;
    rms: number;
    stereoCorrelation: number;
    spectralCentroidHz: number;
    decayMs: number;
    dcOffset: number;
    clippingRatio: number;
    silenceRatio: number;
    complexityScore: number;
    templateFitScore: number;
    polishScore: number;
    overallScore: number;
  };
  macros: MacroSnapshot[];
  processorKinds: string[];
  checks: MetricCheck[];
  notes: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function macroValue(spec: PluginSpec, id: MacroControl['id'], fallback = 0.5): number {
  const macro = spec.macroControls.find((item) => item.id === id);
  if (!macro) return fallback;
  const span = macro.max - macro.min;
  if (span <= 0) return fallback;
  return clamp((macro.init - macro.min) / span, 0, 1);
}

function expectationPass(expectation: TemplateExpectation, actual: number): boolean {
  if (expectation.target === 'min') return actual >= (expectation.value ?? 0);
  if (expectation.target === 'max') return actual <= (expectation.value ?? 0);
  return actual >= (expectation.min ?? Number.NEGATIVE_INFINITY) && actual <= (expectation.max ?? Number.POSITIVE_INFINITY);
}

function buildMeasuredEvaluation(
  spec: PluginSpec,
  measured: FaustMeasuredValues,
  analysisMode: AnalysisMode,
  source: MeasurementSource,
  notes: string[],
): FaustEvaluationMetrics {
  const template = getTemplateDefinition(spec.voiceArchitecture);
  const macros: MacroSnapshot[] = spec.macroControls.map((macro) => ({
    id: macro.id,
    init: round(macro.init),
    normalized: round(macroValue(spec, macro.id)),
  }));

  const macroCoverage = template
    ? round(template.requiredMacros.filter((id) => spec.macroControls.some((macro) => macro.id === id)).length / template.requiredMacros.length)
    : 1;
  const outputChannels = spec.io.outputs;
  const processorKinds = spec.graph.processors.map((proc) => proc.kind);
  const oscillatorCount = spec.graph.source.type === 'synth' ? spec.graph.source.oscillators.length : spec.graph.source.type === 'percussion' ? 1 : 0;

  const complexityScore = round(clamp(
    (processorKinds.length * 0.18) +
    (oscillatorCount * 0.12) +
    (spec.macroControls.length * 0.05) +
    (outputChannels === 2 ? 0.18 : 0),
    0,
    1,
  ));
  const templateFitScore = round(clamp(
    macroCoverage * 0.45 +
    (template ? 0.35 : 0.2) +
    (spec.qualityProfile === 'premium' ? 0.12 : 0.06) +
    (outputChannels === 2 ? 0.08 : 0.04),
    0,
    1,
  ));
  const headroomScore = clamp((Math.abs(measured.peakDb) - 0.5) / 9.5, 0, 1);
  const rmsScore = clamp((measured.rms + 28) / 20, 0, 1);
  const stereoScore = outputChannels === 1
    ? 1
    : clamp(1 - Math.abs(measured.stereoCorrelation - 0.35), 0, 1);
  const polishScore = round(clamp(
    (templateFitScore * 0.28) +
    ((1 - measured.clippingRatio) * 0.22) +
    ((1 - measured.silenceRatio) * 0.12) +
    (headroomScore * 0.12) +
    (stereoScore * 0.14) +
    (complexityScore * 0.12),
    0,
    1,
  ));
  const overallScore = round(clamp(
    (templateFitScore * 0.22) +
    (polishScore * 0.34) +
    (headroomScore * 0.12) +
    (rmsScore * 0.1) +
    ((1 - measured.clippingRatio) * 0.12) +
    ((1 - measured.silenceRatio) * 0.1),
    0,
    1,
  ));

  const metricValues: Record<TemplateExpectation['metric'], number> = {
    peak_db: measured.peakDb,
    rms: measured.rms,
    stereo_correlation: measured.stereoCorrelation,
    spectral_centroid_hz: measured.spectralCentroidHz,
    decay_ms: measured.decayMs,
  };

  const checks: MetricCheck[] = (template?.evaluationExpectations ?? []).map((expectation) => ({
    metric: expectation.metric,
    target: expectation.target,
    actual: metricValues[expectation.metric],
    passed: expectationPass(expectation, metricValues[expectation.metric]),
    rationale: expectation.rationale,
    source,
    value: expectation.value,
    min: expectation.min,
    max: expectation.max,
  }));

  return {
    schemaVersion: '1.0',
    analysisMode,
    compilePassed: true,
    templateId: template?.id ?? null,
    measuredAt: Date.now(),
    metrics: {
      macroCoverage,
      parameterCount: spec.parameters.length,
      processorCount: spec.graph.processors.length,
      oscillatorCount,
      outputChannels,
      peakDb: round(measured.peakDb),
      rms: round(measured.rms),
      stereoCorrelation: round(measured.stereoCorrelation),
      spectralCentroidHz: round(measured.spectralCentroidHz),
      decayMs: round(measured.decayMs),
      dcOffset: round(measured.dcOffset, 6),
      clippingRatio: round(measured.clippingRatio, 6),
      silenceRatio: round(measured.silenceRatio, 6),
      complexityScore,
      templateFitScore,
      polishScore,
      overallScore,
    },
    macros,
    processorKinds,
    checks,
    notes,
  };
}

function toneBrightnessOffset(toneModel: PluginSpec['toneModel']): number {
  switch (toneModel) {
    case 'dark_ambient': return -850;
    case 'tape_vintage': return -350;
    case 'analog_warm': return -150;
    case 'lush_spacious': return 250;
    case 'modern_wide': return 700;
    case 'clean_precise': return 1050;
  }
}

export function evaluateFaustSpec(spec: PluginSpec, faustCode: string): FaustEvaluationMetrics {
  const brightness = macroValue(spec, 'brightness');
  const movement = macroValue(spec, 'movement');
  const body = macroValue(spec, 'body');
  const space = macroValue(spec, 'space');
  const drive = macroValue(spec, 'drive');
  const character = macroValue(spec, 'character');
  const width = macroValue(spec, 'width');
  const punch = macroValue(spec, 'punch');

  const processorKinds = spec.graph.processors.map((proc) => proc.kind);
  const distortionStages = processorKinds.filter((kind) => kind === 'distortion').length;
  const filterPenalty = processorKinds.filter((kind) => kind === 'filter').length * 260;
  const reverbStages = processorKinds.filter((kind) => kind === 'reverb').length;
  const delayStages = processorKinds.filter((kind) => kind === 'delay').length;
  const pannerStages = processorKinds.filter((kind) => kind === 'spatial').length;

  const peakDb = clamp(-8.8 + (spec.qualityProfile === 'premium' ? 0.7 : 0) - drive * 4.2 - character * 1.4 - distortionStages * 0.9 - (spec.kind === 'synth' ? 0.8 : 0), -18, -0.1);
  const rms = clamp((spec.kind === 'effect' ? -21.5 : spec.kind === 'percussion' ? -16.5 : -18.2) + (body * 3.2 + punch * 1.7 - space * (spec.kind === 'effect' ? 0.2 : 0.8)), -28, -8);
  const stereoCorrelation = clamp(
    (spec.stereoProfile === 'mono' ? 0.98 : spec.stereoProfile === 'wide' ? 0.28 : 0.58)
    - width * 0.42
    - movement * 0.08
    - space * 0.06
    - pannerStages * 0.08
    - reverbStages * 0.06,
    -0.25,
    1,
  );
  const spectralCentroidHz = clamp(1700 + toneBrightnessOffset(spec.toneModel) + brightness * 2600 + character * 380 + reverbStages * 120 - filterPenalty, 120, 12000);
  const release = spec.graph.source.type === 'synth' || spec.graph.source.type === 'percussion'
    ? spec.graph.source.envelope.release ?? 0.2
    : 0.2;
  const sustainBoost = spec.graph.source.type === 'synth' ? (spec.graph.source.envelope.sustain ?? 0.6) * 420 : 0;
  const decayMs = spec.kind === 'effect'
    ? clamp(280 + reverbStages * 780 + delayStages * 620 + space * 1800 + movement * 240, 120, 6000)
    : clamp(release * 1000 + sustainBoost + reverbStages * 950 + delayStages * 400 + space * 1500, 80, 7000);

  const notes: string[] = [];
  if ((drive * 0.52) + (character * 0.24) + (distortionStages * 0.16) > 0.72) notes.push('High clipping risk from drive/character settings.');
  if (stereoCorrelation < 0 && spec.io.outputs === 2) notes.push('Very wide stereo image may collapse poorly in mono.');
  if (peakDb > -1) notes.push('Headroom is tight; consider softer drive or more output attenuation.');
  if (faustCode.length > 6000) notes.push('Generated Faust is relatively large and may need extra ranking weight on maintainability.');

  return buildMeasuredEvaluation(spec, {
    peakDb,
    rms,
    stereoCorrelation,
    spectralCentroidHz,
    decayMs,
    dcOffset: 0,
    clippingRatio: clamp((drive * 0.52) + (character * 0.24) + (distortionStages * 0.16), 0, 1),
    silenceRatio: clamp(spec.kind === 'effect' ? 0.03 : 0.02, 0, 1),
  }, 'heuristic-v1', 'heuristic', notes);
}

export function evaluateMeasuredFaust(spec: PluginSpec, measured: FaustMeasuredValues, notes: string[] = []): FaustEvaluationMetrics {
  return buildMeasuredEvaluation(spec, measured, 'essentia-v1', 'essentia', notes);
}
