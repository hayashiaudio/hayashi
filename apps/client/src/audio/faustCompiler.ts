import { FaustDspGenerator } from '@grame/faustwasm';
import type { IFaustMonoWebAudioNode, IFaustPolyWebAudioNode } from '@grame/faustwasm';

const generator = new FaustDspGenerator();

export type CompiledFaustNode = IFaustMonoWebAudioNode | IFaustPolyWebAudioNode;

export function isPolyNode(node: CompiledFaustNode): node is IFaustPolyWebAudioNode {
  return 'keyOn' in node;
}

export async function compileFaustPlugin(
  ctx: AudioContext,
  name: string,
  code: string
): Promise<CompiledFaustNode> {
  if (!code.trim()) throw new Error('No Faust code to compile');

  const node = await generator.createFaustNode(ctx, name, code, false);
  if (!node) {
    throw new Error('Faust compilation failed — the generated code may contain errors');
  }
  return node;
}
