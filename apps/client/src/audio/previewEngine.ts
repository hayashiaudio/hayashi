import { audioEngine } from './engine';
import { getDemoPattern } from './demoPatterns';
import type { DemoPattern } from './demoPatterns';
import type { CompiledFaustNode } from './faustCompiler';
import { isPolyNode } from './faustCompiler';
import type { PluginParam } from '@/stores/pluginStore';

let previewCtx: AudioContext | null = null;
let isPlaying = false;
let nextNoteTime = 0;
let scheduleAheadTime = 0.1;
let lookahead = 25;
let timerID: number | null = null;
let currentPattern: DemoPattern | null = null;
let currentStep = 0;
let stepsPerBar = 16;
let stepDuration = 0;
let faustNode: CompiledFaustNode | null = null;
let scheduledTimeouts: number[] = [];
let sequencerEnabled = false;
let previewInputMode: 'instrument' | 'effect-loop' | 'sample' = 'instrument';
let sampleSource: AudioBufferSourceNode | null = null;

export interface PreviewOptions {
  style: string;
  pluginNode?: CompiledFaustNode | null;
  noSequencer?: boolean;
  connectPluginToOutput?: boolean;
  inputMode?: 'instrument' | 'effect-loop' | 'sample';
  sampleBuffer?: AudioBuffer | null;
}

export async function initPreview() {
  await audioEngine.init();
  previewCtx = audioEngine.ctx;
}

export async function startPreview(options: PreviewOptions) {
  if (!previewCtx) return;
  if (isPlaying) stopPreview();

  await audioEngine.resume();
  audioEngine.setTransportActive(true);
  previewInputMode = options.inputMode ?? 'instrument';

  if (options.pluginNode) {
    faustNode = options.pluginNode;
    if (!isPolyNode(faustNode)) {
      try { (faustNode as any).start?.(); } catch {}
    }
    if (options.connectPluginToOutput) {
      faustNode.connect(audioEngine.destination!);
    }
  }

  sequencerEnabled = !options.noSequencer;

  if (previewInputMode === 'sample' && options.sampleBuffer) {
    const source = previewCtx.createBufferSource();
    sampleSource = source;
    source.buffer = options.sampleBuffer;
    source.loop = true;
    source.connect((faustNode as AudioNode | null) ?? audioEngine.destination!);
    source.start();
    isPlaying = true;
    return;
  }

  if (sequencerEnabled) {
    currentPattern = getDemoPattern(options.style);
    stepDuration = (60 / currentPattern.bpm) / 4;
    currentStep = 0;
    nextNoteTime = previewCtx.currentTime + 0.05;
    isPlaying = true;
    scheduler();
  } else if (faustNode) {
    isPlaying = true;
  }
}

export function stopPreview() {
  isPlaying = false;
  sequencerEnabled = false;
  previewInputMode = 'instrument';
  audioEngine.setTransportActive(false);
  if (timerID !== null) {
    window.clearTimeout(timerID);
    timerID = null;
  }
  for (const id of scheduledTimeouts) {
    window.clearTimeout(id);
  }
  scheduledTimeouts = [];

  if (sampleSource) {
    try { sampleSource.stop(); } catch {}
    try { sampleSource.disconnect(); } catch {}
    sampleSource = null;
  }

  if (faustNode) {
    try {
      if (isPolyNode(faustNode)) {
        faustNode.allNotesOff(true);
      } else {
        try { (faustNode as any).stop?.(); } catch {}
      }
      faustNode.disconnect();
    } catch {
      // may already be disconnected
    }
    try {
      (faustNode as any).destroy?.();
    } catch {
      // ignore
    }
    faustNode = null;
  }
}

export function updatePreviewStyle(style: string) {
  if (!previewCtx || !isPlaying || !sequencerEnabled) return;

  currentPattern = getDemoPattern(style);
  stepDuration = (60 / currentPattern.bpm) / 4;
  currentStep = 0;
  nextNoteTime = previewCtx.currentTime + 0.05;

  for (const id of scheduledTimeouts) {
    window.clearTimeout(id);
  }
  scheduledTimeouts = [];

  if (faustNode) {
    try {
      if (isPolyNode(faustNode)) {
        faustNode.allNotesOff(true);
      } else {
        const node = faustNode as any;
        node.setParamValue?.('/gate', 0);
        node.setParamValue?.('gate', 0);
      }
    } catch {
      // ignore preview transition errors
    }
  }
}

function scheduler() {
  if (!isPlaying || !previewCtx) return;
  while (nextNoteTime < previewCtx.currentTime + scheduleAheadTime) {
    scheduleStep(currentStep, nextNoteTime);
    nextNoteTime += stepDuration;
    currentStep = (currentStep + 1) % stepsPerBar;
  }
  timerID = window.setTimeout(scheduler, lookahead);
}

function scheduleStep(step: number, when: number) {
  if (!currentPattern || !previewCtx) return;
  const { drums, bassline, scale } = currentPattern;
  const effectTarget = previewInputMode === 'effect-loop'
    ? ((faustNode as AudioNode | null) ?? audioEngine.destination!)
    : null;

  if (previewInputMode === 'effect-loop') {
    if (drums.kick.includes(step)) triggerNoise(when, 0.18, 120, effectTarget ?? audioEngine.destination!, 0, 0.8);
    if (drums.snare.includes(step)) triggerNoise(when, 0.12, 1100, effectTarget ?? audioEngine.destination!, step % 8 === 4 ? -0.22 : 0.22, 0.6);
    if (drums.hat.includes(step)) triggerNoise(when, 0.06, 4800, effectTarget ?? audioEngine.destination!, step % 4 === 0 ? -0.7 : 0.7, 0.24);
  } else {
    if (drums.kick.includes(step)) triggerNoise(when, 0.15, 150, effectTarget ?? audioEngine.destination!);
    if (drums.snare.includes(step)) triggerNoise(when, 0.1, 800, effectTarget ?? audioEngine.destination!);
    if (drums.hat.includes(step)) triggerNoise(when, 0.05, 3000, effectTarget ?? audioEngine.destination!);
  }

  if (previewInputMode === 'effect-loop') {
    if (step % 8 === 0) {
      triggerStereoTexture(previewCtx, when, scale[0], stepDuration * 3.5, effectTarget ?? audioEngine.destination!);
    }
    for (const note of bassline) {
      if (note.start === step) {
        const midiNote = scale[note.note];
        triggerBass(previewCtx, when, midiNote, note.duration * stepDuration, effectTarget ?? audioEngine.destination!, true);
      }
    }
    return;
  }

  if (faustNode) {
    if (isPolyNode(faustNode)) {
      for (const note of bassline) {
        if (note.start === step) {
          const midiNote = scale[note.note];
          const onDelayMs = Math.max(0, (when - previewCtx.currentTime) * 1000);
          const offTime = when + note.duration * stepDuration;
          const offDelayMs = Math.max(0, (offTime - previewCtx.currentTime) * 1000);
          const onId = window.setTimeout(() => {
            if (faustNode && isPolyNode(faustNode)) {
              faustNode.keyOn(0, midiNote, 100);
            }
          }, onDelayMs);
          scheduledTimeouts.push(onId);
          const offId = window.setTimeout(() => {
            if (faustNode && isPolyNode(faustNode)) {
              faustNode.keyOff(0, midiNote, 0);
            }
          }, offDelayMs);
          scheduledTimeouts.push(offId);
        }
      }
    } else {
      for (const note of bassline) {
        if (note.start === step) {
          const midiNote = scale[note.note];
          const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
          const onDelayMs = Math.max(0, (when - previewCtx.currentTime) * 1000);
          const onId = window.setTimeout(() => {
            try {
              const n = faustNode as any;
              n.setParamValue?.('/freq', freq);
              n.setParamValue?.('/gate', 1);
              n.setParamValue?.('freq', freq);
              n.setParamValue?.('gate', 1);
            } catch {}
          }, onDelayMs);
          scheduledTimeouts.push(onId);
          const offTime = when + note.duration * stepDuration;
          const delayMs = Math.max(0, (offTime - previewCtx.currentTime) * 1000);
          const offId = window.setTimeout(() => {
            try {
              const n = faustNode as any;
              n.setParamValue?.('/gate', 0);
              n.setParamValue?.('gate', 0);
            } catch {}
          }, delayMs);
          scheduledTimeouts.push(offId);
        }
      }
    }
  } else {
    for (const note of bassline) {
      if (note.start === step) {
        const midiNote = scale[note.note];
        triggerBass(previewCtx, when, midiNote, note.duration * stepDuration, audioEngine.destination!);
      }
    }
  }
}

function triggerNoise(when: number, duration: number, filterFreq: number, destination: AudioNode, pan = 0, level = 0.5) {
  if (!previewCtx) return;
  const noise = previewCtx.createBufferSource();
  const buffer = previewCtx.createBuffer(1, previewCtx.sampleRate * duration, previewCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;

  const filter = previewCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;

  const gain = previewCtx.createGain();
  gain.gain.setValueAtTime(level, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  const panner = previewCtx.createStereoPanner();
  panner.pan.setValueAtTime(pan, when);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(destination);
  noise.start(when);
  noise.stop(when + duration);
}

function triggerBass(ctx: AudioContext, when: number, midiNote: number, duration: number, destination: AudioNode, wide = false) {
  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(wide ? 0.24 : 0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(wide ? -0.18 : 0, when);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(destination);
  osc.start(when);
  osc.stop(when + duration);

  if (!wide) return;

  const oscRight = ctx.createOscillator();
  oscRight.type = 'triangle';
  oscRight.frequency.value = freq * 1.004;

  const filterRight = ctx.createBiquadFilter();
  filterRight.type = 'lowpass';
  filterRight.frequency.value = 1100;
  filterRight.Q.value = 0.8;

  const gainRight = ctx.createGain();
  gainRight.gain.setValueAtTime(0.11, when);
  gainRight.gain.exponentialRampToValueAtTime(0.001, when + duration);

  const pannerRight = ctx.createStereoPanner();
  pannerRight.pan.setValueAtTime(0.28, when);

  oscRight.connect(filterRight);
  filterRight.connect(gainRight);
  gainRight.connect(pannerRight);
  pannerRight.connect(destination);
  oscRight.start(when);
  oscRight.stop(when + duration);
}

function triggerStereoTexture(ctx: AudioContext, when: number, midiNote: number, duration: number, destination: AudioNode) {
  const baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
  const intervals = [0, 7, 12];
  const pans = [-0.65, 0, 0.65];

  intervals.forEach((interval, index) => {
    const osc = ctx.createOscillator();
    osc.type = index === 1 ? 'triangle' : 'sawtooth';
    osc.frequency.value = baseFreq * Math.pow(2, interval / 12) * (1 + (index - 1) * 0.0035);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600 + index * 700, when);
    filter.frequency.exponentialRampToValueAtTime(1400 + index * 420, when + duration);
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(index === 1 ? 0.06 : 0.04, when);
    gain.gain.linearRampToValueAtTime(index === 1 ? 0.1 : 0.07, when + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pans[index], when);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(destination);
    osc.start(when);
    osc.stop(when + duration);
  });
}

export function isPreviewPlaying() {
  return isPlaying;
}

export function getCurrentFaustNode() {
  return faustNode;
}

function normalizeParamToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function candidateParamPaths(name: string): string[] {
  const trimmed = name.trim();
  const slash = `/${trimmed}`;
  const underscored = trimmed.replace(/\s+/g, '_');
  return [...new Set([trimmed, slash, underscored, `/${underscored}`])];
}

function resolveParamPaths(node: CompiledFaustNode, name: string): string[] {
  const candidates = candidateParamPaths(name);
  const available = (node as any).getParams?.() as string[] | undefined;
  if (!available?.length) return candidates;

  const normalizedName = normalizeParamToken(name);
  const matched = available.filter((path) => {
    const last = path.split('/').filter(Boolean).at(-1) ?? path;
    return normalizeParamToken(last) === normalizedName || normalizeParamToken(path) === normalizedName;
  });

  return matched.length > 0 ? [...new Set([...matched, ...candidates])] : candidates;
}

export function applyPreviewParam(name: string, value: number, targetNode?: CompiledFaustNode | null) {
  const target = targetNode ?? faustNode;
  if (!target) return;
  const node = target as any;
  for (const path of resolveParamPaths(target, name)) {
    try {
      node.setParamValue?.(path, value);
    } catch {
      // ignore unsupported aliases
    }
  }
}

export function applyPreviewParams(params: PluginParam[], targetNode?: CompiledFaustNode | null) {
  for (const param of params) {
    applyPreviewParam(param.name, param.value, targetNode);
  }
}
