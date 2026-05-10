export class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  transportGate: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  micStream: MediaStream | null = null;
  micSource: MediaStreamAudioSourceNode | null = null;
  micAnalyser: AnalyserNode | null = null;
  private recorderWorklet: AudioWorkletNode | null = null;
  private worklets = new Map<string, AudioWorkletNode>();
  private initPromise: Promise<void> | null = null;
  private onRecorderBuffer: ((buffer: AudioBuffer) => void) | null = null;

  async init() {
    if (this.ctx) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.transportGate = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.masterGain.connect(this.transportGate);
      this.transportGate.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.8;
      this.transportGate.gain.value = 0;

      // Load core worklets
      await this.ctx.audioWorklet.addModule('/worklets/transport-processor.js');
      await this.ctx.audioWorklet.addModule('/worklets/meter-processor.js');
    })();

    return this.initPromise;
  }

  get destination() {
    return this.masterGain;
  }

  get sampleRate() {
    return this.ctx?.sampleRate ?? 48000;
  }

  createWorklet(name: string, processorName: string, options?: AudioWorkletNodeOptions) {
    if (!this.ctx) throw new Error('AudioEngine not initialized');
    const node = new AudioWorkletNode(this.ctx, processorName, options);
    this.worklets.set(name, node);
    return node;
  }

  removeWorklet(name: string) {
    const node = this.worklets.get(name);
    if (node) {
      node.disconnect();
      node.port.close();
      this.worklets.delete(name);
    }
  }

  async resume() {
    await this.init();
    return this.ctx?.resume() ?? Promise.resolve();
  }

  setTransportActive(active: boolean) {
    if (!this.ctx || !this.transportGate) return;
    const now = this.ctx.currentTime;
    this.transportGate.gain.cancelScheduledValues(now);
    this.transportGate.gain.setValueAtTime(this.transportGate.gain.value, now);
    this.transportGate.gain.linearRampToValueAtTime(active ? 1 : 0, now + 0.03);
  }

  suspend() {
    return this.ctx?.suspend() ?? Promise.resolve();
  }

  getTime() {
    return this.ctx?.currentTime ?? 0;
  }

  async startMic() {
    await this.init();
    if (this.micStream) return;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!this.ctx) return;
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      this.micAnalyser = this.ctx.createAnalyser();
      this.micAnalyser.fftSize = 256;
      this.micSource.connect(this.micAnalyser);
    } catch (e) {
      console.warn('[Hayashi] Mic access denied', e);
    }
  }

  stopMic() {
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch {}
      this.micSource = null;
    }
    if (this.micAnalyser) {
      try { this.micAnalyser.disconnect(); } catch {}
      this.micAnalyser = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  async startRecording(onBuffer: (buffer: AudioBuffer) => void) {
    await this.init();
    await this.startMic();
    if (!this.ctx || !this.micSource) return;
    if (this.recorderWorklet) {
      try { this.recorderWorklet.disconnect(); } catch {}
      this.recorderWorklet = null;
    }
    this.onRecorderBuffer = onBuffer;
    await this.ctx.audioWorklet.addModule('/worklets/recorder-processor.js');
    this.recorderWorklet = new AudioWorkletNode(this.ctx, 'recorder-processor');
    this.recorderWorklet.port.onmessage = (e) => {
      if (e.data.type === 'buffer') {
        const { interleaved, channels, sampleRate } = e.data;
        const frames = Math.floor(interleaved.length / channels);
        const buffer = new AudioBuffer({ length: frames, numberOfChannels: channels, sampleRate });
        for (let ch = 0; ch < channels; ch++) {
          const chData = buffer.getChannelData(ch);
          for (let i = 0; i < frames; i++) {
            chData[i] = interleaved[i * channels + ch];
          }
        }
        this.onRecorderBuffer?.(buffer);
        this.onRecorderBuffer = null;
      }
    };
    this.micSource.connect(this.recorderWorklet);
    this.recorderWorklet.connect(this.ctx.destination);
    this.recorderWorklet.port.postMessage({ type: 'record' });
  }

  stopRecording() {
    if (!this.recorderWorklet || !this.micSource) return;
    const channels = this.micStream?.getAudioTracks()[0]?.getSettings().channelCount ?? 2;
    this.recorderWorklet.port.postMessage({ type: 'stop', channels });
    // Give the worklet a frame to flush before disconnecting
    setTimeout(() => {
      if (this.recorderWorklet) {
        try { this.recorderWorklet.disconnect(); } catch {}
        this.recorderWorklet = null;
      }
    }, 100);
  }
}

export const audioEngine = new AudioEngine();
