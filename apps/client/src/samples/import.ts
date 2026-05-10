export interface DecodedSample {
  id: string;
  name: string;
  buffer: AudioBuffer;
  duration: number;
  sampleRate: number;
  channels: number;
}

export async function decodeAudioFile(source: File | ArrayBuffer, ctx: AudioContext, name?: string): Promise<DecodedSample> {
  const arrayBuffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  const decodeBuffer = arrayBuffer.slice(0);
  const audioBuffer = await ctx.decodeAudioData(decodeBuffer);
  return {
    id: crypto.randomUUID(),
    name: source instanceof File ? source.name : (name ?? 'unknown'),
    buffer: audioBuffer,
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    channels: audioBuffer.numberOfChannels,
  };
}

export function generateWaveformPeaks(buffer: AudioBuffer, bars = 120): number[] {
  const channel = buffer.getChannelData(0);
  const samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
  const peaks: number[] = [];
  for (let i = 0; i < bars; i++) {
    let max = 0;
    for (let j = 0; j < samplesPerBar; j++) {
      const v = Math.abs(channel[i * samplesPerBar + j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  return peaks;
}
