export type NodeKind =
  | 'oscillator'
  | 'noise'
  | 'sampler'
  | 'drumPad'
  | 'micInput'
  | 'midiBridge'
  | 'gain'
  | 'filter'
  | 'delay'
  | 'reverb'
  | 'distortion'
  | 'compressor'
  | 'bitcrusher'
  | 'stereoPanner'
  | 'limiter'
  | 'tremolo'
  | 'autopan'
  | 'chorus'
  | 'pingPongDelay'
  | 'faust'
  | 'output'
  | 'workstation';

export interface PatchNode {
  id: string;
  kind: NodeKind;
  position: { x: number; y: number };
  params: Record<string, number | string | boolean>;
  owner?: string;
  muted?: boolean;
  color?: string;
  faustModuleId?: string;
}

export type SignalType = 'audio' | 'midi' | 'control' | 'clock';

export interface PatchEdge {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  signalType: SignalType;
}

export interface MidiNote {
  id: string;
  pitch: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
}

export interface Clip {
  id: string;
  trackId: string;
  type: 'midi' | 'audio' | 'automation';
  startBeat: number;
  lengthBeats: number;
  loop: boolean;
  notes?: MidiNote[];
  assetId?: string;
}

export interface Asset {
  id: string;
  kind: 'sample' | 'stem' | 'preset' | 'impulse-response';
  name: string;
  mimeType: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  storageUrl?: string;
  localBlobRef?: string;
  waveformPeaks?: number[];
  bpm?: number;
  key?: string;
  timeSignature?: [number, number];
}

export interface TransportState {
  playing: boolean;
  bpm: number;
  beatOffset: number;
  startedAtServerTime?: number;
  timeSignature: [number, number];
  key: string;
  scene: string;
}

export interface UserPresence {
  id: string;
  name: string;
  avatarUrl?: string;
  color: string;
  cursor?: { x: number; y: number };
  focus?: { nodeId?: string; param?: string };
  status?: string;
}

export interface ProjectDoc {
  id: string;
  title: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  timeSignature: [number, number];
  key: string;
  scale: string;
  transport: TransportState;
  nodes: Record<string, PatchNode>;
  edges: Record<string, PatchEdge>;
  clips: Record<string, Clip>;
  tracks: Record<string, Track>;
  assets: Record<string, Asset>;
  scenes: string[];
}

export interface Track {
  id: string;
  name: string;
  color?: string;
  workstationNodeId?: string;
  sourceNodeId?: string;
  armed?: boolean;
  gain?: number;
  pan?: number;
  muted?: boolean;
}

export interface WorkstationState {
  tracks: Record<string, Track & { gain?: number; pan?: number; muted?: boolean }>;
  clips: Record<string, Clip>;
  loopStartBeat: number;
  loopEndBeat: number;
  arrangementLengthBeats: number;
}
