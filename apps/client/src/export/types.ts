export interface ExportOptions {
  format: ExportFormatId;
  bitDepth?: 16 | 24;
  includeMaster?: boolean;
  trackIds?: string[];
  loopOnly?: boolean;
}

export type ExportFormatId =
  | 'stems'
  | 'midi'
  | 'reaper'
  | 'ableton'
  | 'json';

export interface ExportFormat {
  id: ExportFormatId;
  name: string;
  description: string;
  extension: string;
  mimeType: string;
  requiresBilling?: boolean;
  isZip?: boolean;
  generate: (snapshot: ProjectSnapshot, options: ExportOptions) => Promise<Blob>;
}

export interface ExportProgress {
  phase: 'idle' | 'collecting' | 'rendering' | 'encoding' | 'packaging' | 'done' | 'error';
  message: string;
  percent: number;
  currentTrack?: string;
  currentTrackIndex?: number;
  totalTracks?: number;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
}

export interface ProjectSnapshot {
  title: string;
  bpm: number;
  timeSignature: [number, number];
  key: string;
  scale: string;
  nodes: Record<string, import('@/types/project').PatchNode>;
  edges: Record<string, import('@/types/project').PatchEdge>;
  clips: Record<string, import('@/types/project').Clip>;
  tracks: Record<string, import('@/types/project').Track>;
  assets: Record<string, import('@/types/project').Asset>;
  scenes: string[];
}
