import { audioEngine } from './engine';
import { getSample } from '@/samples/indexedDb';

export async function createScheduledSampler(assetId: string, destination: AudioNode) {
  const ctx = audioEngine.ctx;
  if (!ctx) throw new Error('AudioContext not ready');

  const record = await getSample(assetId);
  if (!record) throw new Error(`Sample ${assetId} not found in IndexedDB`);

  const buffer = await ctx.decodeAudioData(record.buffer.slice(0));
  const gain = ctx.createGain();
  gain.connect(destination);

  return {
    buffer,
    gain,
    play(when: number, offset = 0, duration?: number) {
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.gain);
      src.start(when, offset, duration);
      return src;
    },
  };
}
