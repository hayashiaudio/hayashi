import JSZip from 'jszip';
import type { ExportFormat, ExportFormatId } from './types';
import { exportJson } from './jsonExport';
import { exportAllStems } from './stemBounce';
import { exportMidi } from './midiExport';
import { exportReaper } from './reaperExport';
import { exportAbleton } from './abletonExport';

const REGISTRY: Record<ExportFormatId, ExportFormat> = {
  stems: {
    id: 'stems',
    name: 'WAV Stems',
    description: 'Per-track audio + master mix',
    extension: 'zip',
    mimeType: 'application/zip',
    requiresBilling: true,
    isZip: true,
    generate: async (snapshot, options) => {
      const stems = await exportAllStems(snapshot, {
        bitDepth: options.bitDepth,
        includeMaster: options.includeMaster,
        trackIds: options.trackIds,
      });
      const zip = new JSZip();
      for (const stem of stems) {
        zip.file(stem.name, stem.blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      return blob;
    },
  },
  midi: {
    id: 'midi',
    name: 'MIDI',
    description: 'Standard MIDI File (.mid)',
    extension: 'mid',
    mimeType: 'audio/midi',
    generate: exportMidi,
  },
  reaper: {
    id: 'reaper',
    name: 'REAPER',
    description: 'REAPER project (.rpp) + stems',
    extension: 'zip',
    mimeType: 'application/zip',
    requiresBilling: true,
    isZip: true,
    generate: async (snapshot, options) => {
      const stems = await exportAllStems(snapshot, options);
      const { rpp, filename } = await exportReaper(snapshot);
      const zip = new JSZip();
      zip.file(filename, rpp);
      for (const stem of stems) {
        zip.file(`stems/${stem.name}`, stem.blob);
      }
      return zip.generateAsync({ type: 'blob' });
    },
  },
  ableton: {
    id: 'ableton',
    name: 'Ableton Live',
    description: 'Ableton Live Set (.als) + stems',
    extension: 'zip',
    mimeType: 'application/zip',
    requiresBilling: true,
    isZip: true,
    generate: async (snapshot, options) => {
      const stems = await exportAllStems(snapshot, options);
      const { blob, filename } = await exportAbleton(snapshot);
      const zip = new JSZip();
      zip.file(filename, blob);
      for (const stem of stems) {
        zip.file(`stems/${stem.name}`, stem.blob);
      }
      return zip.generateAsync({ type: 'blob' });
    },
  },
  json: {
    id: 'json',
    name: 'Project JSON',
    description: 'Structured metadata for scripts',
    extension: 'json',
    mimeType: 'application/json',
    generate: exportJson,
  },
};

export function getExportFormat(id: ExportFormatId): ExportFormat {
  const fmt = REGISTRY[id];
  if (!fmt) throw new Error(`Unknown export format: ${id}`);
  return fmt;
}

export function listExportFormats(): ExportFormat[] {
  return Object.values(REGISTRY);
}
