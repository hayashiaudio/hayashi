let essentiaModule: any = null;

async function getEssentia() {
  if (essentiaModule) return essentiaModule;
  // @ts-expect-error essentia.js has no declarations
  const mod = await import('essentia.js');
  const wasm = await fetch('/wasm/essentia-wasm.module.wasm');
  const wasmArray = await wasm.arrayBuffer();
  await mod.Essentia.init(wasmArray);
  essentiaModule = mod;
  return mod;
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += ch[i];
  }
  for (let i = 0; i < len; i++) mono[i] /= buffer.numberOfChannels;
  return mono;
}

export async function analyzeSample(buffer: AudioBuffer) {
  const { Essentia } = await getEssentia();
  const essentia = new Essentia();
  const mono = downmixToMono(buffer);

  const vector = essentia.arrayToVector(mono);

  const bpmResult = essentia.RhythmExtractor(vector);
  const keyResult = essentia.KeyExtractor(vector);

  const bpm = bpmResult.bpm ?? 128;
  const key = keyResult.key ?? 'C';
  const scale = keyResult.scale ?? 'major';

  return {
    bpm: Math.max(60, Math.min(200, bpm)),
    key: `${key} ${scale}`,
    duration: buffer.duration,
  };
}
