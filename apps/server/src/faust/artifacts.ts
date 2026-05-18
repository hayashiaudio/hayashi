import { uploadAsset } from '../storage.js';
import type { GeneratedFaustResult } from './generate.js';

export interface ArtifactEntry {
  kind: 'spec_json' | 'faust_dsp' | 'compile_errors_json' | 'eval_metrics_json';
  key: string;
  url: string;
  contentType: string;
}

export interface ArtifactManifest {
  schemaVersion: '1.0';
  pluginId: string;
  versionId: string;
  artifacts: ArtifactEntry[];
}

function buildArtifactKey(pluginId: string, versionId: string, filename: string): string {
  return `generated/${pluginId}/${versionId}/${filename}`;
}

export async function persistGeneratedArtifacts(
  pluginId: string,
  versionId: string,
  generated: GeneratedFaustResult
): Promise<ArtifactManifest> {
  const artifacts: ArtifactEntry[] = [];

  const specKey = buildArtifactKey(pluginId, versionId, 'spec.json');
  const specUrl = await uploadAsset(specKey, Buffer.from(JSON.stringify(generated.spec, null, 2), 'utf8'), 'application/json');
  artifacts.push({
    kind: 'spec_json',
    key: specKey,
    url: specUrl,
    contentType: 'application/json',
  });

  const dspKey = buildArtifactKey(pluginId, versionId, 'plugin.dsp');
  const dspUrl = await uploadAsset(dspKey, Buffer.from(generated.faustCode, 'utf8'), 'text/plain; charset=utf-8');
  artifacts.push({
    kind: 'faust_dsp',
    key: dspKey,
    url: dspUrl,
    contentType: 'text/plain; charset=utf-8',
  });

  const evalMetricsKey = buildArtifactKey(pluginId, versionId, 'eval-metrics.json');
  const evalMetricsUrl = await uploadAsset(evalMetricsKey, Buffer.from(JSON.stringify(generated.evalMetricsJson, null, 2), 'utf8'), 'application/json');
  artifacts.push({
    kind: 'eval_metrics_json',
    key: evalMetricsKey,
    url: evalMetricsUrl,
    contentType: 'application/json',
  });

  const compileErrors = Array.isArray(generated.compileErrorsJson) ? generated.compileErrorsJson : [];
  if (compileErrors.length > 0) {
    const errorsKey = buildArtifactKey(pluginId, versionId, 'compile-errors.json');
    const errorsUrl = await uploadAsset(errorsKey, Buffer.from(JSON.stringify(compileErrors, null, 2), 'utf8'), 'application/json');
    artifacts.push({
      kind: 'compile_errors_json',
      key: errorsKey,
      url: errorsUrl,
      contentType: 'application/json',
    });
  }

  return {
    schemaVersion: '1.0',
    pluginId,
    versionId,
    artifacts,
  };
}
