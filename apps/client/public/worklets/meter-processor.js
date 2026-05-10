class MeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.intervalSamples = Math.floor(sampleRate / 30);
    this.currentSample = 0;
    this.peak = 0;
    this.rms = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    let sum = 0;
    let max = 0;
    for (let i = 0; i < channel.length; i++) {
      const v = channel[i];
      const abs = Math.abs(v);
      if (abs > max) max = abs;
      sum += v * v;
    }
    this.peak = Math.max(this.peak, max);
    this.rms += sum;
    this.currentSample += channel.length;

    if (this.currentSample >= this.intervalSamples) {
      const rms = Math.sqrt(this.rms / this.currentSample);
      this.port.postMessage({ type: 'meter', peak: this.peak, rms });
      this.peak = 0;
      this.rms = 0;
      this.currentSample = 0;
    }
    return true;
  }
}

registerProcessor('meter-processor', MeterProcessor);
