import type { ProjectSnapshot, ExportOptions } from './types';

export async function exportJson(snapshot: ProjectSnapshot, _options: ExportOptions): Promise<Blob> {
  const json = JSON.stringify(snapshot, null, 2);
  return new Blob([json], { type: 'application/json' });
}
