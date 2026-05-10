class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.buffer = [];
    this.port.onmessage = (e) => {
      if (e.data.type === 'record') {
        this.recording = true;
        this.buffer = [];
      } else if (e.data.type === 'stop') {
        this.recording = false;
        const channels = e.data.channels ?? 2;
        const sampleRate = globalThis.sampleRate ?? 48000;
        const interleaved = new Float32Array(this.buffer);
        // Send raw interleaved buffer back to main thread
        this.port.postMessage({ type: 'buffer', interleaved, channels, sampleRate }, [interleaved.buffer]);
        this.buffer = [];
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    if (this.recording) {
      const channelCount = input.length;
      const frameCount = input[0].length;
      for (let i = 0; i < frameCount; i++) {
        for (let ch = 0; ch < channelCount; ch++) {
          this.buffer.push(input[ch]?.[i] ?? 0);
        }
      }
    }

    // Pass-through so downstream nodes hear the mic
    const output = outputs[0];
    if (output && input) {
      for (let ch = 0; ch < input.length; ch++) {
        if (output[ch] && input[ch]) {
          output[ch].set(input[ch]);
        }
      }
    }

    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
