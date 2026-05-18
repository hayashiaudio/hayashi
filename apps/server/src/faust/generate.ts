import { analyzeFaustAudioOrThrow } from './audio-analysis.js';
import { compileFaustOrThrow } from './compile-check.js';
import type { FaustEvaluationMetrics } from './measurement.js';
import { emitFaustFromSpec, parseAndValidatePluginSpec, type PluginKind, type PluginSpec } from './spec-runtime.js';
import { buildUiSpecFromTemplate } from '../ui/runtime.js';
import pluginSpecSchema from './plugin-spec.schema.json' with { type: 'json' };

const SPEC_SCHEMA_RULES = `
STRICT SCHEMA RULES:
- parameters[].kind must be exactly one of: slider, nentry, button, checkbox
- parameters[] objects may only contain: id, label, kind, unit, init, min, max, step
- graph must be an object with exactly: { source, processors }
- graph.source.type must be exactly one of: synth, percussion, effect
- synth source shape: { type: "synth", oscillators: [...], optional noise, envelope: {...} }
- percussion source shape: { type: "percussion", exciter: {...}, envelope: {...} }
- effect source shape: { type: "effect" }
- graph.processors[].kind must be exactly one of: filter, delay, reverb, distortion, spatial
- do not invent fields, aliases, or alternate enum values
- do not output "knob", "toggle", "switch", "dial", or any parameter kind outside the allowed four
- do not output a string or array for graph; graph must be a JSON object

SUPPORTED PROCESSORS BY KIND:
- filter: library "fi", symbol one of lowpass, highpass, resonlp, resonbp
- delay: library "ef", symbol "echo"
- reverb: library "re", symbol one of mono_freeverb, stereo_freeverb
- distortion: library "ef", symbol one of cubicnl, softclipQuadratic, wavefold
- spatial: library "sp", symbol "panner"

MINIMAL EFFECT EXAMPLE:
{
  "schemaVersion": "1.0",
  "kind": "effect",
  "name": "Example",
  "voiceArchitecture": "chorus_reverb",
  "toneModel": "lush_spacious",
  "macroControls": [],
  "io": { "inputs": 2, "outputs": 2 },
  "parameters": [
    { "id": "depth", "label": "Depth", "kind": "slider", "init": 0.4, "min": 0, "max": 1 }
  ],
  "graph": {
    "source": { "type": "effect" },
    "processors": [
      { "kind": "delay", "library": "ef", "symbol": "echo", "time": "0.25", "feedback": "0.35" },
      { "kind": "reverb", "library": "re", "symbol": "stereo_freeverb", "mix": "depth" }
    ]
  }
}
`;

const SPEC_SYSTEM_PROMPT = `
YOU DESIGN FAUST PLUGINS BY OUTPUTTING ONLY JSON.

Return ONLY a valid JSON object. No markdown. No prose. No code fences.

The JSON must follow this design:
- schemaVersion: "1.0"
- kind: "synth" | "effect" | "percussion"
- name: short plugin name
- voiceArchitecture: one of mono_bass, supersaw_pad, velvet_pluck, stereo_lead, plate_space, hall_bloom, microshift_widener, modulated_echo_verb, dark_motion_verb, tempo_echo, chorus_reverb, tape_saturator, analog_ladder_filter, drive_filter_bus, surgical_tone_filter, formant_sweeper, resonant_motion_filter, wah_texture_filter, eq_3band_musical, eq_5band_parametric, eq_tilt_presence, eq_resonant_creative, impact_hit, custom_graph
- toneModel: one of analog_warm, modern_wide, clean_precise, tape_vintage, lush_spacious, dark_ambient
- macroControls: a list of macro controls such as brightness, movement, body, space, drive, character, width, punch, diffusion, damping, preDelay, feedbackTone, modDepth, modRate, bloom, ducking, resonanceShape, sweepRange, tracking, saturationPre, saturationPost, notchAmount, vowelShift, low, lowMid, mid, high, presence, air, trim, weight, clarity, color, resonance
- io: { inputs, outputs }
- parameters: array of UI parameters
- graph: { source, processors }

${SPEC_SCHEMA_RULES}

Allowed source primitives:
- os.osc
- os.sawtooth
- os.square
- os.triangle
- os.lf_sawpos
- os.phasor
- no.noise
- no.pink_noise
- no.brown_noise
- en.adsr
- en.ar
- en.asr

Allowed processors:
- filter: fi.lowpass, fi.highpass, fi.resonlp, fi.resonbp
- delay: ef.echo
- reverb: re.mono_freeverb, re.stereo_freeverb
- distortion: ef.cubicnl, ef.softclipQuadratic, ef.wavefold
- spatial: sp.panner

Expression fields may only reference known parameter ids or numeric literals.

Core parameters are implicit and MUST NOT be redefined in parameters:
- synth: freq, gain, gate
- percussion: freq, gain, trigger
- effect: mix, input_gain

Prefer these architectures when they fit the request:
- mono_bass: focused mono synth bass, punchy and saturated
- supersaw_pad: wide lush pad with stereo motion and reverb
- velvet_pluck: premium pluck with soft ambience and crisp attack
- stereo_lead: polished stereo lead with movement and presence
- plate_space: dense bright plate-style ambience with controlled bloom
- hall_bloom: larger smoother hall with cinematic depth and soft onset
- microshift_widener: subtle premium stereo widening with low mono-collapse risk
- modulated_echo_verb: rhythmic echoes feeding a polished spatial tail
- dark_motion_verb: moody filtered animated ambience
- tempo_echo: rhythmic echo insert effect
- chorus_reverb: wide chorus plus reverb spatial effect
- tape_saturator: warm color/saturation effect with mix-safe tone shaping
- analog_ladder_filter: warm resonant musical filter color
- drive_filter_bus: premium drive plus tone-shaping insert
- surgical_tone_filter: cleaner more predictable mix-focused filtering
- formant_sweeper: expressive vowel-like moving filter color
- resonant_motion_filter: animated resonant movement without brittle harshness
- wah_texture_filter: performance-style wah and sweep texture effect
- impact_hit: cinematic/electronic one-shot percussion
`;

const SPEC_REPAIR_SYSTEM_PROMPT = `
You repair Hayashi Faust plugin JSON specs.

Return ONLY corrected JSON. No markdown. No prose.

Rules:
- keep the same schemaVersion
- keep the same kind unless explicitly told otherwise
- preserve or improve the voiceArchitecture when possible
- do not invent unsupported libraries or symbols
- satisfy the validator exactly; do not leave near-miss enum values in place
- if parameters[].kind is invalid, rewrite it to one of: slider, nentry, button, checkbox
- if graph is malformed, rewrite it as an object with exactly: source, processors
- only use these processors:
  - fi.lowpass, fi.highpass, fi.resonlp, fi.resonbp
  - ef.echo
  - re.mono_freeverb, re.stereo_freeverb
  - ef.cubicnl, ef.softclipQuadratic, ef.wavefold
  - sp.panner
- expression fields may only reference known parameter ids or numeric literals
- optimize for compilable Faust, not novelty

${SPEC_SCHEMA_RULES}
`;

type ProviderKind = 'cloudflare-workers-ai' | 'openai-compatible';

export interface GeneratedFaustResult {
  faustCode: string;
  spec: PluginSpec;
  templateId: string | null;
  toneModel: string | null;
  qualityProfile: string | null;
  stereoProfile: string | null;
  macroJson: unknown;
  uiSpecJson: unknown;
  evalMetricsJson: unknown;
  compileErrorsJson: unknown;
  artifactManifestJson: unknown;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CandidateResult {
  candidateId: string;
  spec: PluginSpec;
  faustCode: string;
  compileErrors: string[];
  evalMetrics: FaustEvaluationMetrics;
}

interface WorkersAIResponse {
  result?: { response?: string } | string;
  success?: boolean;
  errors?: Array<{ code: number; message: string }>;
  response?: string;
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      refusal?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

const OPENAI_PLUGIN_SPEC_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'hayashi_plugin_spec',
    strict: true,
    schema: pluginSpecSchema,
  },
} as const;

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '';
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? '';
const CF_MODEL = process.env.CF_MODEL ?? '@cf/moonshotai/kimi-k2.6';

const AI_PROVIDER = (process.env.AI_PROVIDER ?? '').trim().toLowerCase();
const AI_BASE_URL = (process.env.AI_BASE_URL ?? '').trim();
const AI_API_KEY = process.env.AI_API_KEY ?? '';
const AI_MODEL = (process.env.AI_MODEL ?? '').trim();
const AI_API_KEY_HEADER = (process.env.AI_API_KEY_HEADER ?? 'Authorization').trim();
const AI_API_KEY_PREFIX = process.env.AI_API_KEY_PREFIX ?? 'Bearer ';
const LLM_FETCH_TIMEOUT_MS = Number(process.env.LLM_FETCH_TIMEOUT_MS ?? 25000);
const MAX_GENERATION_TIME_MS = Number(process.env.MAX_GENERATION_TIME_MS ?? 55000);

function getProviderKind(): ProviderKind {
  if (AI_PROVIDER === 'openai-compatible') return 'openai-compatible';
  if (AI_PROVIDER === 'cloudflare-workers-ai') return 'cloudflare-workers-ai';
  if (AI_BASE_URL || AI_API_KEY || AI_MODEL) return 'openai-compatible';
  return 'cloudflare-workers-ai';
}

function stripCodeFences(raw: string): string {
  return raw
    .replace(/```json\n?/g, '')
    .replace(/```faust\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}

function extractJsonObject(raw: string): string {
  const trimmed = stripCodeFences(raw);
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Model response did not contain a JSON object');
  }
  return trimmed.slice(start, end + 1);
}

function buildOpenAICompatibleUrl(): string {
  if (!AI_BASE_URL) {
    throw new Error('OpenAI-compatible provider not configured. Set AI_BASE_URL.');
  }
  if (AI_BASE_URL.endsWith('/chat/completions')) return AI_BASE_URL;
  return `${AI_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
}

function buildOpenAICompatibleHeaders(): Record<string, string> {
  if (!AI_API_KEY) {
    throw new Error('OpenAI-compatible provider not configured. Set AI_API_KEY.');
  }

  const keyHeader = AI_API_KEY_HEADER || 'Authorization';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers[keyHeader] = keyHeader.toLowerCase() === 'authorization'
    ? `${AI_API_KEY_PREFIX}${AI_API_KEY}`
    : AI_API_KEY;
  return headers;
}

async function callCloudflareWorkersAI(messages: ChatMessage[]): Promise<string> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Cloudflare Workers AI credentials not configured. Set CF_ACCOUNT_ID and CF_API_TOKEN.');
  }

  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Workers AI error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as WorkersAIResponse;
  if (!data.success && data.errors && data.errors.length > 0) {
    throw new Error(`Workers AI error: ${data.errors[0].message}`);
  }

  if (data.result && typeof data.result === 'object' && 'response' in data.result) {
    return stripCodeFences(data.result.response ?? '');
  }
  if (typeof data.result === 'string') {
    return stripCodeFences(data.result);
  }
  return stripCodeFences(data.response ?? '');
}

function extractOpenAICompatibleText(data: OpenAICompatibleResponse): string {
  const refusal = data.choices?.[0]?.message?.refusal;
  if (refusal) throw new Error(`Model refused structured output: ${refusal}`);
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part?.text ?? '').join('');
  if (data.error?.message) throw new Error(data.error.message);
  return '';
}

async function callOpenAICompatible(messages: ChatMessage[]): Promise<string> {
  if (!AI_MODEL) {
    throw new Error('OpenAI-compatible provider not configured. Set AI_MODEL.');
  }

  const res = await fetch(buildOpenAICompatibleUrl(), {
    method: 'POST',
    headers: buildOpenAICompatibleHeaders(),
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      temperature: 0.2,
      response_format: OPENAI_PLUGIN_SPEC_RESPONSE_FORMAT,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`OpenAI-compatible provider error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as OpenAICompatibleResponse;
  return stripCodeFences(extractOpenAICompatibleText(data));
}

async function generateFromMessages(messages: ChatMessage[]): Promise<string> {
  return getProviderKind() === 'openai-compatible'
    ? callOpenAICompatible(messages)
    : callCloudflareWorkersAI(messages);
}

function inferPluginType(prompt: string): PluginKind {
  const p = prompt.toLowerCase();
  if (p.includes('reverb') || p.includes('delay') || p.includes('filter') || p.includes('chorus') || p.includes('flanger') || p.includes('phaser') || p.includes('echo') || p.includes('distortion') || p.includes('compressor') || p.includes('modulator') || p.includes('effect')) {
    return 'effect';
  }
  if (p.includes('kick') || p.includes('snare') || p.includes('hat') || p.includes('perc') || p.includes('drum') || p.includes('clap') || p.includes('tom')) {
    return 'percussion';
  }
  return 'synth';
}

function kindSpecificPrompt(kind: PluginKind): string {
  if (kind === 'effect') {
    return 'Prefer plate_space for dense plate ambience, hall_bloom for cinematic hall depth, microshift_widener for subtle premium widening, modulated_echo_verb for rhythmic space, dark_motion_verb for moody animated ambience, tempo_echo for focused delay, chorus_reverb for lush spatial widening, tape_saturator for premium color/saturation, analog_ladder_filter for warm resonant filtering, drive_filter_bus for colored tone shaping, surgical_tone_filter for cleaner mix-focused filtering, formant_sweeper for vowel-like movement, resonant_motion_filter for animated resonant sweeps, and wah_texture_filter for performance-style wah character. Create an effect spec with io.inputs 1 or 2 and output audio processing, not a self-oscillating synth voice.';
  }
  if (kind === 'percussion') {
    return 'Prefer impact_hit for cinematic/electronic percussion. Create a percussive one-shot spec with short envelopes and io.inputs 0.';
  }
  return 'Prefer mono_bass for basses, supersaw_pad for wide pads, velvet_pluck for premium plucks, and stereo_lead for polished leads. Create a synth spec with oscillators, envelope, and io.inputs 0.';
}

async function repairSpec(rawSpec: string, errorMessage: string, expectedKind: PluginKind): Promise<string> {
  return extractJsonObject(await generateFromMessages([
    { role: 'system', content: SPEC_REPAIR_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Expected kind: ${expectedKind}`,
        `Validation or compile error: ${errorMessage}`,
        'Here is the current JSON spec:',
        rawSpec,
        'Return a corrected JSON spec only.',
      ].join('\n\n'),
    },
  ]));
}

function candidatePromptVariant(expectedKind: PluginKind, index: number): string {
  const synthVariants = [
    'Bias toward solid defaults, clean compile margin, and restrained modulation.',
    'Bias toward width, movement, and richer ambience while keeping the architecture disciplined.',
    'Bias toward stronger character and macro contrast, but stay inside the supported template family.',
  ];
  const effectVariants = [
    'Bias toward stable insert-effect behavior, bounded tails, and mix-safe defaults.',
    'Bias toward wider stereo motion and more pronounced ambience while keeping tails controlled.',
    'Bias toward stronger character and modulation detail without destabilizing gain structure.',
  ];
  const percussionVariants = [
    'Bias toward punch, concise envelopes, and clean one-shot behavior.',
    'Bias toward extra character and body while keeping the transient intact.',
    'Bias toward more texture and motion while staying clearly percussive.',
  ];

  const variants = expectedKind === 'effect'
    ? effectVariants
    : expectedKind === 'percussion'
      ? percussionVariants
      : synthVariants;
  return variants[index] ?? variants[variants.length - 1];
}

function withCandidateVariant(messages: ChatMessage[], expectedKind: PluginKind, candidateIndex: number): ChatMessage[] {
  const variant = candidatePromptVariant(expectedKind, candidateIndex);
  return messages.map((message, index) => {
    if (index !== messages.length - 1 || message.role !== 'user') return message;
    return {
      ...message,
      content: `${message.content}\n\nCandidate variant ${candidateIndex + 1}: ${variant}`,
    };
  });
}

function scoreCandidate(candidate: CandidateResult): number {
  const failedChecks = candidate.evalMetrics.checks.filter((check) => !check.passed).length;
  return Number((
    candidate.evalMetrics.metrics.overallScore
    - failedChecks * 0.06
    - Math.min(candidate.compileErrors.length, 4) * 0.015
  ).toFixed(6));
}

function buildEvalMetricsPayload(winner: CandidateResult, candidates: CandidateResult[]): unknown {
  return {
    ...winner.evalMetrics,
    candidateLineage: {
      candidateCount: candidates.length,
      selectedCandidateId: winner.candidateId,
      summaries: candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        templateId: candidate.evalMetrics.templateId,
        overallScore: scoreCandidate(candidate),
        failedChecks: candidate.evalMetrics.checks.filter((check) => !check.passed).length,
        compileErrorCount: candidate.compileErrors.length,
        notes: candidate.evalMetrics.notes,
      })),
    },
  };
}

function toGeneratedResult(winner: CandidateResult, candidates: CandidateResult[]): GeneratedFaustResult {
  return {
    faustCode: winner.faustCode,
    spec: winner.spec,
    templateId: winner.spec.voiceArchitecture ?? null,
    toneModel: winner.spec.toneModel ?? null,
    qualityProfile: winner.spec.qualityProfile ?? null,
    stereoProfile: winner.spec.stereoProfile ?? null,
    macroJson: winner.spec.macroControls ?? [],
    uiSpecJson: buildUiSpecFromTemplate(winner.spec),
    evalMetricsJson: buildEvalMetricsPayload(winner, candidates),
    compileErrorsJson: winner.compileErrors,
    artifactManifestJson: {
      schemaVersion: '1.0',
      artifacts: [],
    },
  };
}

function isInfrastructureError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('unavailable') || lower.includes('timed out') || lower.includes('enoent');
}

async function generateSingleCandidate(messages: ChatMessage[], expectedKind: PluginKind, candidateId: string): Promise<CandidateResult> {
  let specText = extractJsonObject(await generateFromMessages(messages));
  let lastError = 'Unknown generation failure';
  const compileErrors: string[] = [];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const spec = parseAndValidatePluginSpec(specText, expectedKind);
      const faustCode = emitFaustFromSpec(spec);
      await compileFaustOrThrow(faustCode);
      const evalMetrics = await analyzeFaustAudioOrThrow(spec, faustCode);
      return {
        candidateId,
        spec,
        faustCode,
        compileErrors,
        evalMetrics,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      compileErrors.push(lastError);

      // Infrastructure errors (missing binaries, timeouts) cannot be fixed by spec repair.
      // Throw immediately so the caller can fall back or surface the real issue.
      if (isInfrastructureError(lastError)) {
        throw new Error(lastError);
      }

      if (attempt === 3) break;
      specText = await repairSpec(specText, lastError, expectedKind);
    }
  }

  throw new Error(`Failed to produce valid Faust after repair attempts: ${lastError}`);
}

function candidateCountForKind(expectedKind: PluginKind): number {
  return expectedKind === 'percussion' ? 2 : 3;
}

async function generateValidatedFaust(messages: ChatMessage[], expectedKind: PluginKind): Promise<GeneratedFaustResult> {
  const count = candidateCountForKind(expectedKind);
  const results = await Promise.allSettled(
    Array.from({ length: count }, (_, index) => {
      const candidateId = `candidate-${index + 1}`;
      return generateSingleCandidate(
        withCandidateVariant(messages, expectedKind, index),
        expectedKind,
        candidateId,
      );
    })
  );

  const candidates: CandidateResult[] = [];
  const failures: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      candidates.push(result.value);
    } else {
      failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Failed to produce valid Faust candidates: ${failures.join(' | ')}`);
  }

  const winner = [...candidates].sort((left, right) => scoreCandidate(right) - scoreCandidate(left))[0];
  return toGeneratedResult(winner, candidates);
}

export async function generateFaustFromPrompt(prompt: string): Promise<GeneratedFaustResult> {
  const expectedKind = inferPluginType(prompt);
  return generateValidatedFaust([
    { role: 'system', content: SPEC_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Prompt: ${prompt}`,
        `Expected kind: ${expectedKind}`,
        kindSpecificPrompt(expectedKind),
        'Return ONLY JSON for a Hayashi plugin spec.',
      ].join('\n\n'),
    },
  ], expectedKind);
}

function buildIterationPrompt(
  instruction: string,
  previousCode: string,
  previousPrompts: string[],
  type: PluginKind,
  previousParams: { name: string; min: number; max: number }[]
): string {
  return [
    `Expected kind: ${type}`,
    kindSpecificPrompt(type),
    'You are updating an existing plugin.',
    `Instruction: ${instruction}`,
    previousPrompts.length > 0 ? `Previous user prompts:\n${previousPrompts.join('\n')}` : '',
    previousParams.length > 0
      ? `Existing parameter hints:\n${previousParams.map((param) => `- ${param.name}: ${param.min}..${param.max}`).join('\n')}`
      : '',
    'Current Faust code for reference:',
    previousCode,
    'Return ONLY a corrected JSON spec for the updated plugin.',
  ].filter(Boolean).join('\n\n');
}

export async function iterateFaustFromPrompt(
  instruction: string,
  previousCode: string,
  previousPrompts: string[],
  type: PluginKind,
  previousParams: { name: string; min: number; max: number }[]
): Promise<GeneratedFaustResult> {
  return generateValidatedFaust([
    { role: 'system', content: SPEC_SYSTEM_PROMPT },
    { role: 'user', content: buildIterationPrompt(instruction, previousCode, previousPrompts, type, previousParams) },
  ], type);
}

export { inferPluginType };
