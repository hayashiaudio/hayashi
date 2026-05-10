import { FaustDspGenerator } from '@grame/faustwasm';

let generatorInstance: InstanceType<typeof FaustDspGenerator> | null = null;

function getGenerator(): InstanceType<typeof FaustDspGenerator> {
  if (!generatorInstance) {
    generatorInstance = new FaustDspGenerator();
  }
  return generatorInstance;
}

export async function compileFaustNode(
  ctx: AudioContext,
  dspCode: string,
  name: string
): Promise<AudioWorkletNode | null> {
  const generator = getGenerator();
  const node = await generator.createFaustNode(ctx, name, dspCode, false, 256);
  return node as AudioWorkletNode | null;
}
