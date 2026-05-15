import type { PatchNode, PatchEdge, Track } from '@/types/project';
import { audioEngine } from './engine';
import { midiEngine } from './midiEngine';
import { getSample } from '@/samples/indexedDb';
import { transportScheduler } from './transportScheduler';
import { createScheduledSampler } from './scheduledSampler';
import { registerSubmix, unregisterSubmix } from './drumEngine';
import { useProjectStore } from '@/stores/projectStore';

export interface RuntimeNode {
  id: string;
  kind: PatchNode['kind'];
  audioNode: AudioNode | null;
  outputNode?: AudioNode | null;
  sourceNode?: AudioScheduledSourceNode | null;
  params: Record<string, number>;
}

export interface RuntimeConnection {
  sourceId: string;
  sourcePort: string;
  targetId: string;
  targetPort: string;
}

export interface CompiledGraph {
  nodes: Map<string, RuntimeNode>;
  connections: RuntimeConnection[];
}

/* Keep the last compiled graph so updateNodeParam can reach live audio nodes */
let lastCompiledGraph: CompiledGraph | null = null;

/** Stop a raw AudioBufferSourceNode / OscillatorNode for a given patch node.
 *  Used by the arrangement scheduler to take over playback from the raw graph. */
export function stopRawSource(nodeId: string) {
  if (!lastCompiledGraph) return;
  const runtime = lastCompiledGraph.nodes.get(nodeId);
  if (runtime?.sourceNode) {
    try { runtime.sourceNode.stop(); } catch {}
    runtime.sourceNode = null;
  }
}

/* AudioBuffers are bound to their AudioContext — cache per-context. */
const sampleBufferCache = new WeakMap<RenderContext, Map<string, AudioBuffer>>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createSourceOutput(ctx: RenderContext, gainValue = 1) {
  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  return gain;
}

function createImpulseResponse(ctx: RenderContext, decaySeconds: number) {
  const duration = clamp(decaySeconds, 0.2, 6);
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = Math.pow(1 - t, 2.5);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }

  return impulse;
}

function createDistortionCurve(amount: number) {
  const drive = clamp(amount, 0, 1) * 400;
  const samples = 2048;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + drive) * x * 20 * deg) / (Math.PI + drive * Math.abs(x));
  }
  return curve;
}

function createBitcrusherCurve(bits: number) {
  const normalizedBits = clamp(Math.round(bits), 1, 16);
  const steps = Math.pow(2, normalizedBits);
  const samples = 2048;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

function createProcessorNode(
  ctx: AudioContext,
  kind: string,
  params: Record<string, number | string | boolean>
): { input: AudioNode; output: AudioNode } {
  switch (kind) {
    case 'stereoPanner': {
      const panner = ctx.createStereoPanner();
      panner.pan.value = (params.pan as number) ?? 0;
      return { input: panner, output: panner };
    }
    case 'limiter': {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = (params.threshold as number) ?? -0.1;
      limiter.ratio.value = (params.ratio as number) ?? 20;
      limiter.attack.value = (params.attack as number) ?? 0.003;
      limiter.release.value = (params.release as number) ?? 0.1;
      limiter.knee.value = 0;
      return { input: limiter, output: limiter };
    }
    case 'tremolo': {
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = (params.rate as number) ?? 5;
      lfoGain.gain.value = ((params.depth as number) ?? 0.5) * 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      return { input: gain, output: gain };
    }
    case 'autopan': {
      const panner = ctx.createStereoPanner();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = (params.rate as number) ?? 0.5;
      lfoGain.gain.value = ((params.depth as number) ?? 0.8) * 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(panner.pan);
      lfo.start();
      return { input: panner, output: panner };
    }
    case 'gain': {
      const gain = ctx.createGain();
      gain.gain.value = (params.gain as number) ?? 1;
      return { input: gain, output: gain };
    }
    case 'filter': {
      const filter = ctx.createBiquadFilter();
      filter.type = (params.type as BiquadFilterType) ?? 'lowpass';
      filter.frequency.value = (params.frequency as number) ?? 1000;
      filter.Q.value = (params.Q as number) ?? 1;
      return { input: filter, output: filter };
    }
    case 'delay': {
      const delay = ctx.createDelay(5);
      delay.delayTime.value = (params.delayTime as number) ?? (params.time as number) ?? 0.3;
      return { input: delay, output: delay };
    }
    case 'reverb': {
      const convolver = ctx.createConvolver();
      convolver.normalize = true;
      convolver.buffer = createImpulseResponse(ctx, (params.decay as number) ?? 2);
      return { input: convolver, output: convolver };
    }
    case 'distortion': {
      const shaper = ctx.createWaveShaper();
      shaper.curve = createDistortionCurve((params.amount as number) ?? 0.5);
      shaper.oversample = '4x';
      return { input: shaper, output: shaper };
    }
    case 'compressor': {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = (params.threshold as number) ?? -24;
      compressor.ratio.value = (params.ratio as number) ?? 4;
      compressor.attack.value = (params.attack as number) ?? 0.01;
      compressor.release.value = (params.release as number) ?? 0.1;
      return { input: compressor, output: compressor };
    }
    case 'bitcrusher': {
      const shaper = ctx.createWaveShaper();
      shaper.curve = createBitcrusherCurve((params.bits as number) ?? 8);
      return { input: shaper, output: shaper };
    }
    case 'chorus': {
      const input = ctx.createGain();
      const delay = ctx.createDelay(0.05);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const wet = ctx.createGain();
      const dry = ctx.createGain();
      const output = ctx.createGain();
      delay.delayTime.value = 0.015;
      lfo.type = 'sine';
      lfo.frequency.value = (params.rate as number) ?? 0.5;
      lfoGain.gain.value = ((params.depth as number) ?? 0.5) * 0.005;
      wet.gain.value = (params.mix as number) ?? 0.5;
      dry.gain.value = 1 - wet.gain.value;
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      input.connect(delay);
      input.connect(dry);
      delay.connect(wet);
      dry.connect(output);
      wet.connect(output);
      lfo.start();
      return { input, output };
    }
    case 'pingPongDelay': {
      const input = ctx.createGain();
      const leftDelay = ctx.createDelay(2);
      const rightDelay = ctx.createDelay(2);
      const leftPan = ctx.createStereoPanner();
      const rightPan = ctx.createStereoPanner();
      const feedback = ctx.createGain();
      const wet = ctx.createGain();
      const dry = ctx.createGain();
      const output = ctx.createGain();
      leftDelay.delayTime.value = (params.time as number) ?? 0.3;
      rightDelay.delayTime.value = leftDelay.delayTime.value * 1.5;
      feedback.gain.value = (params.feedback as number) ?? 0.4;
      leftPan.pan.value = -1;
      rightPan.pan.value = 1;
      wet.gain.value = (params.mix as number) ?? 0.5;
      dry.gain.value = 1 - wet.gain.value;
      input.connect(leftDelay);
      input.connect(rightDelay);
      leftDelay.connect(feedback);
      rightDelay.connect(feedback);
      feedback.connect(leftDelay);
      feedback.connect(rightDelay);
      leftDelay.connect(leftPan);
      rightDelay.connect(rightPan);
      leftPan.connect(wet);
      rightPan.connect(wet);
      input.connect(dry);
      dry.connect(output);
      wet.connect(output);
      return { input, output };
    }
    default: {
      const pass = ctx.createGain();
      return { input: pass, output: pass };
    }
  }
}

export async function getCachedSampleBuffer(assetId: string, ctx: RenderContext): Promise<AudioBuffer | null> {
  let ctxCache = sampleBufferCache.get(ctx);
  if (!ctxCache) {
    ctxCache = new Map<string, AudioBuffer>();
    sampleBufferCache.set(ctx, ctxCache);
  }
  const cached = ctxCache.get(assetId);
  if (cached) return cached;

  let sample = await getSample(assetId);

  if (!sample) {
    const asset = useProjectStore.getState().assets[assetId];
    if (asset?.storageUrl) {
      const { fetchMissingSample } = await import('@/samples/sync');
      const ok = await fetchMissingSample(assetId, asset.storageUrl, {
        name: asset.name,
        mimeType: asset.mimeType,
        duration: asset.durationSeconds,
        sampleRate: asset.sampleRate,
        channels: asset.channels,
        waveformPeaks: asset.waveformPeaks,
      });
      if (ok) sample = await getSample(assetId);
    }
  }

  if (!sample) {
    console.warn('[Hayashi] Sample asset not found in IndexedDB:', assetId);
    return null;
  }

  const buffer = await ctx.decodeAudioData(sample.buffer.slice(0));
  ctxCache.set(assetId, buffer);
  return buffer;
}

function cleanupGraph(graph: CompiledGraph) {
  for (const conn of graph.connections) {
    const source = graph.nodes.get(conn.sourceId);
    const target = graph.nodes.get(conn.targetId);
    const sourceOut = source?.outputNode ?? source?.audioNode;
    const targetIn = target?.audioNode;
    if (sourceOut && targetIn) {
      try {
        sourceOut.disconnect(targetIn);
      } catch {
        // may already be disconnected
      }
    }
  }

  for (const runtime of graph.nodes.values()) {
    if (!runtime.audioNode) continue;

    if (runtime.sourceNode) {
      try {
        runtime.sourceNode.stop();
      } catch {
        // may already be stopped
      }
    }

    // Don't disconnect output (masterGain)
    if (runtime.kind !== 'output') {
      try {
        runtime.audioNode.disconnect();
      } catch {
        // may already be disconnected
      }
      if (runtime.outputNode) {
        try {
          runtime.outputNode.disconnect();
        } catch {
          // may already be disconnected
        }
      }
    }
  }

  for (const runtime of graph.nodes.values()) {
    if (runtime.kind === 'drumPad') {
      unregisterSubmix(runtime.id);
    }
    if (runtime.kind === 'midiBridge') {
      midiEngine.unregisterNode(runtime.id);
    }
  }
}

const activeSourcesByClip = new Map<string, AudioBufferSourceNode[]>();
const subMixBuses = new Map<string, { gain: GainNode; pan: StereoPannerNode }>();
const trackFxInputs = new Map<string, AudioNode>();

function clearTrackBuses() {
  for (const bus of subMixBuses.values()) {
    try {
      bus.pan.disconnect();
      bus.gain.disconnect();
    } catch {
      /* may already be disconnected */
    }
  }
  subMixBuses.clear();
  trackFxInputs.clear();
}

function buildTrackBuses(
  ctx: AudioContext,
  tracks: Record<string, Track>,
  graph: CompiledGraph,
  nodes: Record<string, PatchNode>
) {
  clearTrackBuses();
  for (const track of Object.values(tracks)) {
    if (!track.workstationNodeId) continue;
    const workstation = graph.nodes.get(track.workstationNodeId);
    if (!workstation?.audioNode) continue;

    const gain = ctx.createGain();
    gain.gain.value = track.muted ? 0 : (track.gain ?? 1);

    const pan = ctx.createStereoPanner();
    pan.pan.value = track.pan ?? 0;

    gain.connect(pan);
    pan.connect(workstation.audioNode);
    subMixBuses.set(track.id, { gain, pan });

    // Insert FX chain between source and track bus
    if (track.fxChain && track.fxChain.length > 0) {
      let currentNode: AudioNode = gain;
      for (let i = track.fxChain.length - 1; i >= 0; i--) {
        const nodeId = track.fxChain[i];
        const node = nodes[nodeId];
        if (!node) continue;
        const proc = createProcessorNode(ctx, node.kind, node.params);
        proc.output.connect(currentNode);
        currentNode = proc.input;
      }
      trackFxInputs.set(track.id, currentNode);

      // Reroute live source from workstation to FX input
      if (track.sourceNodeId) {
        const sourceRuntime = graph.nodes.get(track.sourceNodeId);
        const sourceOut = sourceRuntime?.outputNode ?? sourceRuntime?.audioNode;
        if (sourceOut && workstation.audioNode) {
          try {
            sourceOut.disconnect(workstation.audioNode);
          } catch {
            /* may not be connected */
          }
          sourceOut.connect(currentNode);
        }
      }
    }
  }
}

/** Update a single track's submix bus levels without recompiling the graph. */
export function updateTrackBus(trackId: string, gain?: number, pan?: number, muted?: boolean) {
  const bus = subMixBuses.get(trackId);
  if (!bus) return;
  if (gain !== undefined) {
    bus.gain.gain.setTargetAtTime(muted ? 0 : gain, audioEngine.ctx?.currentTime ?? 0, 0.01);
  }
  if (pan !== undefined) {
    bus.pan.pan.setTargetAtTime(pan, audioEngine.ctx?.currentTime ?? 0, 0.01);
  }
  if (muted !== undefined && gain === undefined) {
    const currentGain = bus.gain.gain.value;
    bus.gain.gain.setTargetAtTime(muted ? 0 : currentGain, audioEngine.ctx?.currentTime ?? 0, 0.01);
  }
}

transportScheduler.onStartClip = async (clip, when) => {
  const ctx = audioEngine.ctx;
  if (!ctx) return;

  /* Respect source-node mute state and track mute: if either is muted,
     don't schedule clips on this track. */
  const state = useProjectStore.getState();
  const track = state.tracks[clip.trackId];
  if (track?.muted) return;
  if (track?.sourceNodeId) {
    const source = state.nodes[track.sourceNodeId];
    if (source?.muted) return;
  }

  const fxInput = trackFxInputs.get(clip.trackId);
  const bus = fxInput ?? subMixBuses.get(clip.trackId)?.gain ?? audioEngine.destination;
  if (!bus) return;

  try {
    const sampler = await createScheduledSampler(clip.assetId, bus);
    const duration = clip.loop ? undefined : sampler.buffer.duration;
    const src = sampler.play(when, clip.offsetSeconds ?? 0, duration);

    const arr = activeSourcesByClip.get(clip.id) ?? [];
    arr.push(src);
    activeSourcesByClip.set(clip.id, arr);

    transportScheduler.registerSource?.(clip.id, src);

    src.onended = () => {
      const list = activeSourcesByClip.get(clip.id) ?? [];
      activeSourcesByClip.set(
        clip.id,
        list.filter((s) => s !== src)
      );
    };
  } catch (e) {
    console.warn('[Hayashi] Failed to schedule clip', clip.id, e);
  }
};

type RenderContext = AudioContext | OfflineAudioContext;

async function compileGraphInternal(
  ctx: RenderContext,
  destination: AudioNode,
  nodes: Record<string, PatchNode>,
  edges: Record<string, PatchEdge>
): Promise<CompiledGraph> {
  const runtimeNodes = new Map<string, RuntimeNode>();

  /* Nodes that feed a workstation should not auto-start their sample
     playback — the arrangement scheduler owns timing instead. */
  const sequencedSourceIds = new Set<string>();
  for (const edge of Object.values(edges)) {
    const target = nodes[edge.targetNodeId];
    if (target?.kind === 'workstation') {
      sequencedSourceIds.add(edge.sourceNodeId);
    }
  }

  for (const node of Object.values(nodes)) {
    let audioNode: AudioNode | null = null;
    let outputNode: AudioNode | null = null;
    let sourceNode: AudioScheduledSourceNode | null = null;
    const isSequenced = sequencedSourceIds.has(node.id);

    switch (node.kind) {
      case 'oscillator': {
        const osc = ctx.createOscillator();
        osc.type = (node.params.type as OscillatorType) ?? 'sine';
        osc.frequency.value = (node.params.frequency as number) ?? 440;
        const output = createSourceOutput(ctx, node.muted ? 0 : ((node.params.gain as number) ?? 0.5));
        osc.connect(output);
        audioNode = output;
        sourceNode = osc;
        osc.start();
        break;
      }
      case 'noise': {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        const type = (node.params.type as string) ?? 'white';
        for (let i = 0; i < bufferSize; i++) {
          let v = Math.random() * 2 - 1;
          if (type === 'pink') {
            v = (v + (i > 0 ? data[i - 1] : 0)) / 2;
          } else if (type === 'brown') {
            const last = i > 0 ? data[i - 1] : 0;
            v = (last + (v * 0.02)) / 1.02;
          }
          data[i] = v;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const output = createSourceOutput(ctx, node.muted ? 0 : ((node.params.gain as number) ?? 0.3));
        source.connect(output);
        audioNode = output;
        sourceNode = source;
        source.start();
        break;
      }
      case 'sampler': {
        const assetId = typeof node.params.assetId === 'string' ? node.params.assetId : '';
        if (!assetId) break;

        const buffer = await getCachedSampleBuffer(assetId, ctx);
        if (!buffer) break;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = (node.params.playbackRate as number) ?? 1;
        source.loop = Boolean(node.params.loop);

        if (source.loop) {
          const start = Math.max(0, Math.min(1, Number(node.params.start ?? 0)));
          const end = Math.max(start, Math.min(1, Number(node.params.end ?? 1)));
          source.loopStart = start * buffer.duration;
          source.loopEnd = end * buffer.duration;
        }

        const output = createSourceOutput(ctx, node.muted ? 0 : ((node.params.gain as number) ?? 1));
        source.connect(output);
        audioNode = output;
        sourceNode = source;
        if (!isSequenced) {
          source.start();
        }
        break;
      }
      case 'drumPad': {
        const mode = (node.params.mode as string) ?? 'live';
        const outputAssetId = (node.params.outputAssetId as string) ?? '';

        if (mode === 'rendered' && outputAssetId) {
          const buffer = await getCachedSampleBuffer(outputAssetId, ctx);
          if (!buffer) break;
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = Boolean(node.params.outputLoop);
          const output = createSourceOutput(ctx, node.muted ? 0 : ((node.params.gain as number) ?? 0.8));
          source.connect(output);
          audioNode = output;
          sourceNode = source;
          if (!isSequenced) {
            source.start();
          }
        } else {
          const submix = ctx.createGain();
          submix.gain.value = node.muted ? 0 : ((node.params.gain as number) ?? 0.8);
          audioNode = submix;
          registerSubmix(node.id, submix);
        }
        break;
      }
      case 'midiBridge': {
        const osc = ctx.createOscillator();
        osc.type = (node.params.waveform as OscillatorType) ?? 'sine';
        osc.frequency.value = 440;
        const envGain = ctx.createGain();
        envGain.gain.value = 0;
        const output = createSourceOutput(ctx, node.muted ? 0 : ((node.params.gain as number) ?? 0.8));
        osc.connect(envGain);
        envGain.connect(output);
        audioNode = output;
        sourceNode = osc;
        osc.start();
        midiEngine.registerNode(node.id, ctx as AudioContext, { oscillator: osc, envelopeGain: envGain, outputGain: output });
        midiEngine.updateNodeParams(node.id, {
          waveform: (node.params.waveform as string) ?? 'sine',
          attack: (node.params.attack as number) ?? 0.01,
          decay: (node.params.decay as number) ?? 0.3,
          sustain: (node.params.sustain as number) ?? 0.6,
          release: (node.params.release as number) ?? 0.5,
          gain: (node.params.gain as number) ?? 0.8,
          channelFilter: (node.params.channelFilter as number | 'all') ?? 'all',
          armed: Boolean(node.params.armed),
        });
        break;
      }
      case 'stereoPanner': {
        const panner = ctx.createStereoPanner();
        panner.pan.value = (node.params.pan as number) ?? 0;
        audioNode = panner;
        break;
      }
      case 'limiter': {
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = (node.params.threshold as number) ?? -0.1;
        limiter.ratio.value = (node.params.ratio as number) ?? 20;
        limiter.attack.value = (node.params.attack as number) ?? 0.003;
        limiter.release.value = (node.params.release as number) ?? 0.1;
        limiter.knee.value = 0;
        audioNode = limiter;
        break;
      }
      case 'tremolo': {
        const gain = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = (node.params.rate as number) ?? 5;
        lfoGain.gain.value = ((node.params.depth as number) ?? 0.5) * 0.5;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        lfo.start();
        audioNode = gain;
        sourceNode = lfo;
        break;
      }
      case 'autopan': {
        const panner = ctx.createStereoPanner();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = (node.params.rate as number) ?? 0.5;
        lfoGain.gain.value = ((node.params.depth as number) ?? 0.8) * 0.5;
        lfo.connect(lfoGain);
        lfoGain.connect(panner.pan);
        lfo.start();
        audioNode = panner;
        sourceNode = lfo;
        break;
      }
      case 'gain': {
        const gain = ctx.createGain();
        gain.gain.value = (node.params.gain as number) ?? 1;
        audioNode = gain;
        break;
      }
      case 'filter': {
        const filter = ctx.createBiquadFilter();
        filter.type = (node.params.type as BiquadFilterType) ?? 'lowpass';
        filter.frequency.value = (node.params.frequency as number) ?? 1000;
        filter.Q.value = (node.params.Q as number) ?? 1;
        audioNode = filter;
        break;
      }
      case 'delay': {
        const delay = ctx.createDelay(5);
        delay.delayTime.value = (node.params.delayTime as number) ?? (node.params.time as number) ?? 0.3;
        audioNode = delay;
        break;
      }
      case 'reverb': {
        const convolver = ctx.createConvolver();
        convolver.normalize = true;
        convolver.buffer = createImpulseResponse(ctx, (node.params.decay as number) ?? 2);
        audioNode = convolver;
        break;
      }
      case 'distortion': {
        const shaper = ctx.createWaveShaper();
        shaper.curve = createDistortionCurve((node.params.amount as number) ?? 0.5);
        shaper.oversample = '4x';
        audioNode = shaper;
        break;
      }
      case 'compressor': {
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = (node.params.threshold as number) ?? -24;
        compressor.ratio.value = (node.params.ratio as number) ?? 4;
        compressor.attack.value = (node.params.attack as number) ?? 0.01;
        compressor.release.value = (node.params.release as number) ?? 0.1;
        audioNode = compressor;
        break;
      }
      case 'bitcrusher': {
        const shaper = ctx.createWaveShaper();
        shaper.curve = createBitcrusherCurve((node.params.bits as number) ?? 8);
        audioNode = shaper;
        break;
      }
      case 'chorus': {
        const input = ctx.createGain();
        const delay = ctx.createDelay(0.05);
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const output = ctx.createGain();
        delay.delayTime.value = 0.015;
        lfo.type = 'sine';
        lfo.frequency.value = (node.params.rate as number) ?? 0.5;
        lfoGain.gain.value = ((node.params.depth as number) ?? 0.5) * 0.005;
        wet.gain.value = (node.params.mix as number) ?? 0.5;
        dry.gain.value = 1 - wet.gain.value;
        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        input.connect(delay);
        input.connect(dry);
        delay.connect(wet);
        dry.connect(output);
        wet.connect(output);
        lfo.start();
        audioNode = input;
        outputNode = output;
        sourceNode = lfo;
        break;
      }
      case 'pingPongDelay': {
        const input = ctx.createGain();
        const leftDelay = ctx.createDelay(2);
        const rightDelay = ctx.createDelay(2);
        const leftPan = ctx.createStereoPanner();
        const rightPan = ctx.createStereoPanner();
        const feedback = ctx.createGain();
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const output = ctx.createGain();
        leftDelay.delayTime.value = (node.params.time as number) ?? 0.3;
        rightDelay.delayTime.value = leftDelay.delayTime.value * 1.5;
        feedback.gain.value = (node.params.feedback as number) ?? 0.4;
        leftPan.pan.value = -1;
        rightPan.pan.value = 1;
        wet.gain.value = (node.params.mix as number) ?? 0.5;
        dry.gain.value = 1 - wet.gain.value;
        input.connect(leftDelay);
        input.connect(rightDelay);
        leftDelay.connect(feedback);
        rightDelay.connect(feedback);
        feedback.connect(leftDelay);
        feedback.connect(rightDelay);
        leftDelay.connect(leftPan);
        rightDelay.connect(rightPan);
        leftPan.connect(wet);
        rightPan.connect(wet);
        input.connect(dry);
        dry.connect(output);
        wet.connect(output);
        audioNode = input;
        outputNode = output;
        break;
      }
      case 'output': {
        audioNode = destination;
        break;
      }
      case 'workstation': {
        const mixer = ctx.createGain();
        mixer.gain.value = (node.params.gain as number) ?? 1;
        audioNode = mixer;
        break;
      }
      default:
        audioNode = null;
    }

    runtimeNodes.set(node.id, {
      id: node.id,
      kind: node.kind,
      audioNode,
      outputNode,
      sourceNode,
      params: Object.fromEntries(
        Object.entries(node.params).filter(([, v]) => typeof v === 'number')
      ) as Record<string, number>,
    });
  }

  const connections: RuntimeConnection[] = [];
  for (const edge of Object.values(edges)) {
    const source = runtimeNodes.get(edge.sourceNodeId);
    const target = runtimeNodes.get(edge.targetNodeId);
    const sourceOut = source?.outputNode ?? source?.audioNode;
    const targetIn = target?.audioNode;
    if (!sourceOut || !targetIn) continue;

    try {
      sourceOut.connect(targetIn);
      connections.push({
        sourceId: edge.sourceNodeId,
        sourcePort: edge.sourcePort,
        targetId: edge.targetNodeId,
        targetPort: edge.targetPort,
      });
    } catch (e) {
      console.warn('[Hayashi] Failed to connect', edge, e);
    }
  }

  return { nodes: runtimeNodes, connections };
}

export async function compileGraph(
  nodes: Record<string, PatchNode>,
  edges: Record<string, PatchEdge>,
  tracks?: Record<string, Track>
): Promise<CompiledGraph> {
  await audioEngine.init();
  const ctx = audioEngine.ctx!;

  if (lastCompiledGraph) {
    cleanupGraph(lastCompiledGraph);
  }

  const graph = await compileGraphInternal(ctx, audioEngine.destination!, nodes, edges);
  lastCompiledGraph = graph;

  if (tracks) {
    buildTrackBuses(ctx, tracks, graph, nodes);
  }

  return graph;
}

export async function renderGraphOffline(
  ctx: OfflineAudioContext,
  snapshot: import('@/export/types').ProjectSnapshot,
  trackIds?: string[]
) {
  const { nodes, edges, clips, tracks, bpm } = snapshot;
  const graph = await compileGraphInternal(ctx, ctx.destination, nodes, edges);

  /* Schedule audio clips directly on the OfflineAudioContext timeline.
     The live transportScheduler uses requestAnimationFrame, which doesn't
     run during offline rendering.  */
  const beatToSeconds = (beats: number) => ((beats / (bpm || 128)) * 60);

  const clipsToSchedule = Object.values(clips).filter((c) => {
    if (c.type !== 'audio' || !c.assetId) return false;
    if (!trackIds) return true;
    return trackIds.includes(c.trackId);
  });

  console.log('[Hayashi] Offline render: bpm=', bpm, 'clips=', Object.values(clips).length, 'audioClips=', clipsToSchedule.length, 'trackIds=', trackIds);

  for (const clip of clipsToSchedule) {
    const track = tracks[clip.trackId];
    if (!track || track.muted) continue;

    let targetNode: AudioNode | null = null;
    if (track.workstationNodeId) {
      const ws = graph.nodes.get(track.workstationNodeId);
      targetNode = ws?.audioNode ?? null;
    }
    if (!targetNode) {
      targetNode = ctx.destination;
    }

    if (!clip.assetId) continue;
    const buffer = await getCachedSampleBuffer(clip.assetId, ctx);
    if (!buffer) {
      console.warn('[Hayashi] Offline: sample not found for clip', clip.id, clip.assetId);
      continue;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (clip.loop) {
      source.loop = true;
    }
    source.connect(targetNode);

    const when = beatToSeconds(clip.startBeat);
    const duration = clip.loop ? undefined : beatToSeconds(clip.lengthBeats);
    console.log('[Hayashi] Offline: scheduling clip', clip.id, 'asset=', clip.assetId, 'when=', when, 'dur=', duration, 'target=', targetNode?.constructor?.name);
    source.start(when, 0, duration);
  }
}

export function tapNode(
  nodeId: string,
  destination: MediaStreamAudioDestinationNode
): (() => void) | null {
  if (!lastCompiledGraph) return null;
  const runtime = lastCompiledGraph.nodes.get(nodeId);
  const sourceOut = runtime?.outputNode ?? runtime?.audioNode;
  if (!sourceOut) return null;
  sourceOut.connect(destination);
  return () => {
    try { sourceOut.disconnect(destination); } catch {}
  };
}

export function updateNodeParam(nodeId: string, param: string, value: number) {
  if (!lastCompiledGraph) return;
  const runtime = lastCompiledGraph.nodes.get(nodeId);
  if (!runtime?.audioNode) return;

  const node = runtime.audioNode;
  const sourceNode = runtime.sourceNode ?? null;

  /* Built-in AudioParam targets */
  const paramMap: Record<string, string> = {
    frequency: 'frequency',
    gain: 'gain',
    Q: 'Q',
    delayTime: 'delayTime',
    playbackRate: 'playbackRate',
    threshold: 'threshold',
    ratio: 'ratio',
    attack: 'attack',
    release: 'release',
    pan: 'pan',
    rate: 'frequency',
  };

  const audioParamKey = paramMap[param];
  if (audioParamKey && audioParamKey in node) {
    const ap = (node as unknown as Record<string, AudioParam>)[audioParamKey];
    if (ap && typeof ap.setValueAtTime === 'function') {
      ap.setValueAtTime(value, audioEngine.ctx?.currentTime ?? 0);
      return;
    }
  }

  if (sourceNode && audioParamKey && audioParamKey in sourceNode) {
    const ap = (sourceNode as unknown as Record<string, AudioParam>)[audioParamKey];
    if (ap && typeof ap.setValueAtTime === 'function') {
      ap.setValueAtTime(value, audioEngine.ctx?.currentTime ?? 0);
      return;
    }
  }

  console.log('[Hayashi] Param update unhandled', nodeId, param, value);
}
