import type { PluginThread, PluginVersionRecord, QualityLabel } from './repository.js';

export interface TrainingCorpusRecord {
  pluginId: string;
  versionId: string;
  versionNumber: number;
  pluginName: string;
  pluginType: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  conversationPrompts: string[];
  chosenArchitecture: string | null;
  toneModel: string | null;
  qualityProfile: string | null;
  stereoProfile: string | null;
  specJson: unknown | null;
  macroJson: unknown | null;
  evalMetricsJson: unknown | null;
  qualityLabels: QualityLabel[];
  compileErrorsJson: unknown | null;
  artifactManifestJson: unknown | null;
  faustCode: string;
  paramsJson: string;
}

function versionLabels(version: PluginVersionRecord): QualityLabel[] {
  return Array.isArray(version.qualityLabelsJson) ? version.qualityLabelsJson as QualityLabel[] : [];
}

export function buildTrainingCorpus(threads: PluginThread[]): TrainingCorpusRecord[] {
  return threads.flatMap((thread) => {
    const conversationPrompts = thread.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content);

    return thread.versions.map((version) => ({
      pluginId: thread.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      pluginName: thread.name,
      pluginType: thread.type,
      ownerId: thread.ownerId,
      createdAt: version.createdAt,
      updatedAt: thread.updatedAt,
      prompt: version.prompt,
      conversationPrompts,
      chosenArchitecture: version.templateId,
      toneModel: version.toneModel,
      qualityProfile: version.qualityProfile,
      stereoProfile: version.stereoProfile,
      specJson: version.specJson,
      macroJson: version.macroJson,
      evalMetricsJson: version.evalMetricsJson,
      qualityLabels: versionLabels(version),
      compileErrorsJson: version.compileErrorsJson,
      artifactManifestJson: version.artifactManifestJson,
      faustCode: version.faustCode,
      paramsJson: version.paramsJson,
    }));
  });
}
