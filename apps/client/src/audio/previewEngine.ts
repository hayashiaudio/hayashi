import { audioEngine } from './engine';
import { getDemoPattern } from './demoPatterns';
import type { DemoPattern } from './demoPatterns';

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

export interface PreviewOptions {
  style: string;
  pluginWASM?: ArrayBuffer | null;
  pluginParams?: Record<string, number>;
}

export async function initPreview() {
  await audioEngine.init();
  previewCtx = audioEngine.ctx;
}

export function startPreview(options: PreviewOptions) {
  if (!previewCtx) return;
  if (isPlaying) stopPreview();

  currentPattern = getDemoPattern(options.style);
  stepDuration = (60 / currentPattern.bpm) / 4;
  currentStep = 0;
  nextNoteTime = previewCtx.currentTime + 0.05;
  isPlaying = true;
  scheduler();
}

export function stopPreview() {
  isPlaying = false;
  if (timerID !== null) {
    window.clearTimeout(timerID);
    timerID = null;
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

  if (drums.kick.includes(step)) triggerNoise(when, 0.15, 150);
  if (drums.snare.includes(step)) triggerNoise(when, 0.1, 800);
  if (drums.hat.includes(step)) triggerNoise(when, 0.05, 3000);

  for (const note of bassline) {
    if (note.start === step) {
      const midiNote = scale[note.note];
      triggerBass(previewCtx, when, midiNote, note.duration * stepDuration);
    }
  }
}

function triggerNoise(when: number, duration: number, filterFreq: number) {
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
  gain.gain.setValueAtTime(0.5, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioEngine.destination!);
  noise.start(when);
  noise.stop(when + duration);
}

function triggerBass(ctx: AudioContext, when: number, midiNote: number, duration: number) {
  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioEngine.destination!);
  osc.start(when);
  osc.stop(when + duration);
}

export function isPreviewPlaying() {
  return isPlaying;
}
