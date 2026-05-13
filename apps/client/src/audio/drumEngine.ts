import { audioEngine } from './engine';
import { getCachedSampleBuffer } from './graphCompiler';
import { storeSample } from '@/samples/indexedDb';

export interface DrumHit {
  padIndex: number;
  when: number; // AudioContext.currentTime
}

const submixes = new Map<string, GainNode>();
const activeSources = new Map<string, AudioBufferSourceNode>();

export function registerSubmix(nodeId: string, gain: GainNode) {
  submixes.set(nodeId, gain);
}

export function unregisterSubmix(nodeId: string) {
  const gain = submixes.get(nodeId);
  if (gain) {
    try { gain.disconnect(); } catch { /* already disconnected */ }
    submixes.delete(nodeId);
  }
}

export function getSubmix(nodeId: string): GainNode | null {
  return submixes.get(nodeId) ?? null;
}

export function stopPad(nodeId: string, padIndex: number) {
  const key = `${nodeId}-${padIndex}`;
  const src = activeSources.get(key);
  if (src) {
    try { src.stop(); } catch { /* already stopped */ }
    try { src.disconnect(); } catch {}
    activeSources.delete(key);
  }
}

export async function triggerPad(
  nodeId: string,
  padIndex: number,
  assetId: string,
  opts?: { bypassGraph?: boolean }
) {
  const ctx = audioEngine.ctx;
  if (!ctx) return;
  if (!assetId) return;

  const buffer = await getCachedSampleBuffer(assetId, ctx);
  if (!buffer) {
    console.warn('[drumEngine] Sample not found for pad', padIndex, assetId);
    return;
  }

  const submix = submixes.get(nodeId);
  const isTransportActive = (audioEngine.transportGate?.gain.value ?? 0) > 0.01;

  let src: AudioBufferSourceNode;

  if (submix && isTransportActive && !opts?.bypassGraph) {
    // Transport is running — route through the graph submix
    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(submix);
    src.start(ctx.currentTime);
    src.onended = () => {
      try { src.disconnect(); } catch { /* already disconnected */ }
    };
  } else {
    // One-shot preview: bypass transport gate so pads always audible
    const previewGain = ctx.createGain();
    previewGain.gain.value = (submix as GainNode | null)?.gain.value ?? 0.8;
    previewGain.connect(ctx.destination);

    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(previewGain);
    src.start(ctx.currentTime);

    src.onended = () => {
      try { src.disconnect(); } catch {}
      try { previewGain.disconnect(); } catch {}
    };
  }

  activeSources.set(`${nodeId}-${padIndex}`, src);
}

function interleaveChannels(buffer: AudioBuffer): Float32Array {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const interleaved = new Float32Array(ch0.length * 2);
  for (let i = 0; i < ch0.length; i++) {
    interleaved[i * 2] = ch0[i];
    interleaved[i * 2 + 1] = ch1[i];
  }
  return interleaved;
}

function floatTo16BitPCM(input: Float32Array): DataView {
  const view = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return view;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const interleaved = interleaveChannels(buffer);
  const pcm = floatTo16BitPCM(interleaved);
  const headerSize = 44;
  const totalSize = headerSize + pcm.byteLength;
  const wav = new ArrayBuffer(totalSize);
  const view = new DataView(wav);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, pcm.byteLength, true);

  const pcmBytes = new Uint8Array(pcm.buffer);
  const wavBytes = new Uint8Array(wav, headerSize);
  wavBytes.set(pcmBytes, 0);

  return new Blob([wav], { type: 'audio/wav' });
}

export async function renderBeat(
  hits: DrumHit[],
  getAssetIdForPad: (padIndex: number) => string
): Promise<AudioBuffer> {
  const ctx = audioEngine.ctx;
  if (!ctx) throw new Error('AudioContext not ready');

  const sampleRate = ctx.sampleRate;
  let duration = 0;
  const scheduled: Array<{ buffer: AudioBuffer; when: number }> = [];

  for (const hit of hits) {
    const assetId = getAssetIdForPad(hit.padIndex);
    if (!assetId) continue;
    const buffer = await getCachedSampleBuffer(assetId, ctx);
    if (!buffer) continue;
    const end = hit.when + buffer.duration;
    if (end > duration) duration = end;
    scheduled.push({ buffer, when: hit.when });
  }

  if (duration === 0) throw new Error('No valid hits to render');

  const minWhen = Math.min(...scheduled.map((s) => s.when));
  const normalizedDuration = duration - minWhen;
  const frames = Math.ceil(normalizedDuration * sampleRate);
  const offline = new OfflineAudioContext(2, frames, sampleRate);

  for (const { buffer, when } of scheduled) {
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.connect(offline.destination);
    src.start(when - minWhen);
  }

  return offline.startRendering();
}

export async function storeRenderedBeat(
  buffer: AudioBuffer,
  name: string
): Promise<{ id: string; durationSeconds: number; arrayBuffer: ArrayBuffer }> {
  const blob = encodeWav(buffer);
  const id = `asset-${crypto.randomUUID().slice(0, 8)}`;
  const arrayBuffer = await blob.arrayBuffer();
  await storeSample(id, name, arrayBuffer, 'audio/wav', {});
  return { id, durationSeconds: buffer.duration, arrayBuffer };
}
