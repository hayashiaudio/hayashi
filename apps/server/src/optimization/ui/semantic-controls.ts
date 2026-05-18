export type ControlSemanticGroup =
  | 'space'
  | 'diffusion'
  | 'damping'
  | 'predelay'
  | 'bloom'
  | 'modulation'
  | 'brightness'
  | 'body'
  | 'movement'
  | 'width'
  | 'punch'
  | 'character'
  | 'low'
  | 'mid'
  | 'high'
  | 'presence'
  | 'air'
  | 'trim'
  | 'tone'
  | 'surgical'
  | 'output'
  | 'utility';

const GROUP_BY_CONTROL_ID: Record<string, ControlSemanticGroup> = {
  space: 'space',
  diffusion: 'diffusion',
  damping: 'damping',
  preDelay: 'predelay',
  bloom: 'bloom',
  modDepth: 'modulation',
  modRate: 'modulation',
  feedbackTone: 'damping',
  brightness: 'brightness',
  body: 'body',
  movement: 'movement',
  width: 'width',
  punch: 'punch',
  character: 'character',
  low: 'low',
  low_mid: 'mid',
  mid: 'mid',
  high: 'high',
  presence: 'presence',
  air: 'air',
  trim: 'trim',
  weight: 'low',
  clarity: 'presence',
  color: 'tone',
  resonance: 'surgical',
};

export function getControlSemanticGroup(controlId: string): ControlSemanticGroup {
  return GROUP_BY_CONTROL_ID[controlId] ?? 'utility';
}
