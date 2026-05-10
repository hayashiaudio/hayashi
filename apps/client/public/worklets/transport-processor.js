class TransportProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.playing = false;
    this.bpm = 128;
    this.beatOffset = 0;
    this.startedAt = 0;
    this.samplesPerBeat = (60 / 128) * sampleRate;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'start') {
        this.playing = true;
        this.startedAt = currentTime;
        this.beatOffset = msg.beatOffset ?? 0;
        this.bpm = msg.bpm ?? 128;
        this.samplesPerBeat = (60 / this.bpm) * sampleRate;
      } else if (msg.type === 'stop') {
        this.playing = false;
      } else if (msg.type === 'update') {
        this.bpm = msg.bpm ?? this.bpm;
        this.samplesPerBeat = (60 / this.bpm) * sampleRate;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.playing) return true;
    const elapsed = currentTime - this.startedAt;
    const currentBeat = this.beatOffset + elapsed * (this.bpm / 60);
    const bar = Math.floor(currentBeat / 4) + 1;
    const beatInBar = Math.floor(currentBeat % 4) + 1;

    if (Math.floor(currentTime * 100) % 10 === 0) {
      this.port.postMessage({ type: 'tick', currentBeat, bar, beatInBar, bpm: this.bpm });
    }
    return true;
  }
}

registerProcessor('transport-processor', TransportProcessor);
