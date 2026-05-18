import type { IFaustMonoWebAudioNode, IFaustPolyWebAudioNode } from '@grame/faustwasm';

type FaustModule = {
  FaustDspGenerator: new () => {
    createFaustNode(
      ctx: AudioContext,
      name: string,
      code: string,
      sp?: boolean,
      bufferSize?: number
    ): Promise<CompiledFaustNode | null>;
  };
};

let generatorPromise: Promise<InstanceType<FaustModule['FaustDspGenerator']>> | null = null;

export type CompiledFaustNode = IFaustMonoWebAudioNode | IFaustPolyWebAudioNode;

export function isPolyNode(node: CompiledFaustNode): node is IFaustPolyWebAudioNode {
  return 'keyOn' in node;
}

async function getFaustGenerator() {
  if (!generatorPromise) {
    const moduleUrl = '/vendor/faustwasm/index.js';
    generatorPromise = import(/* @vite-ignore */ moduleUrl)
      .then((mod) => new (mod as FaustModule).FaustDspGenerator());
  }
  return generatorPromise;
}

export async function compileFaustPlugin(
  ctx: AudioContext,
  name: string,
  code: string
): Promise<CompiledFaustNode> {
  if (!code.trim()) throw new Error('No Faust code to compile');
  const generator = await getFaustGenerator();

  try {
    const workletNode = await generator.createFaustNode(ctx, name, code, false);
    if (workletNode) {
      return workletNode;
    }
  } catch (error) {
    console.warn('[Hayashi] AudioWorklet Faust compile path failed, retrying with ScriptProcessor fallback.', error);
  }

  const fallbackNode = await generator.createFaustNode(ctx, name, code, true);
  if (!fallbackNode) {
    throw new Error('Faust compilation failed — the generated code may contain errors');
  }
  return fallbackNode;
}
