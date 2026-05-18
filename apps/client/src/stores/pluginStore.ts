import { create } from 'zustand';
import type { UiSpec } from '@/types/uiSpec';

export interface PluginParam {
  name: string;
  value: number;
  min: number;
  max: number;
}

export interface PluginVersion {
  id: string;
  versionNumber: number;
  prompt: string;
  faustCode: string;
  params: PluginParam[];
  qualityLabels: QualityLabel[];
  createdAt: number;
  uiSpec?: UiSpec;
  features?: {
    centroid: number;
    rms: number;
    zcr: number;
    peakDb: number;
  };
}

export type QualityLabel = 'good' | 'harsh' | 'muddy' | 'boring' | 'too_wet' | 'too_narrow' | 'unstable';

export interface PluginMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  versionId?: string;
  createdAt: number;
}

export interface GeneratedPlugin {
  id: string;
  name: string;
  prompt: string;
  status: 'generating' | 'ready' | 'error';
  type: 'synth' | 'percussion' | 'effect';
  params: PluginParam[];
  faustCode: string;
  wasmUrl: string | null;
  createdAt: number;
  uiSpec?: UiSpec;

  // Thread support
  versions: PluginVersion[];
  messages: PluginMessage[];
  currentVersionId: string | null;

  previewMode?: 'loop' | 'midi' | 'mic' | 'sample';
  previewSampleName?: string | null;
  previewSampleBuffer?: AudioBuffer | null;
}

interface PluginState {
  plugins: GeneratedPlugin[];
  activePluginId: string | null;
  selectedStyle: string;
  previewPlaying: boolean;

  setActivePlugin: (id: string | null) => void;
  setSelectedStyle: (style: string) => void;
  addPlugin: (plugin: GeneratedPlugin) => void;
  updatePluginStatus: (id: string, status: GeneratedPlugin['status']) => void;
  updatePluginParams: (id: string, params: PluginParam[]) => void;
  setPreviewPlaying: (playing: boolean) => void;
  setPlugins: (plugins: GeneratedPlugin[]) => void;

  // Thread actions
  addVersion: (pluginId: string, version: PluginVersion) => void;
  addMessage: (pluginId: string, message: PluginMessage) => void;
  rollbackToVersion: (pluginId: string, versionId: string) => void;
  updatePluginFromVersion: (pluginId: string, versionId: string) => void;
  setPreviewMode: (pluginId: string, mode: 'loop' | 'midi' | 'mic' | 'sample') => void;
  setPreviewSample: (pluginId: string, sampleName: string | null, sampleBuffer: AudioBuffer | null) => void;
  updateVersionQualityLabels: (pluginId: string, versionId: string, qualityLabels: QualityLabel[]) => void;
}

export const usePluginStore = create<PluginState>((set) => ({
  plugins: [],
  activePluginId: null,
  selectedStyle: 'disco',
  previewPlaying: false,

  setActivePlugin: (id) => set({ activePluginId: id }),
  setSelectedStyle: (style) => set({ selectedStyle: style }),
  setPlugins: (plugins) => set({
    plugins,
    activePluginId: plugins[0]?.id ?? null,
  }),
  addPlugin: (plugin) => set((s) => ({ plugins: [plugin, ...s.plugins] })),
  updatePluginStatus: (id, status) =>
    set((s) => ({
      plugins: s.plugins.map((p) => (p.id === id ? { ...p, status } : p)),
    })),
  updatePluginParams: (id, params) =>
    set((s) => ({
      plugins: s.plugins.map((p) => (p.id === id ? { ...p, params } : p)),
    })),
  setPreviewPlaying: (playing) => set({ previewPlaying: playing }),

  addVersion: (pluginId, version) =>
    set((s) => ({
      plugins: s.plugins.map((p) =>
        p.id === pluginId
          ? { ...p, versions: [version, ...p.versions], currentVersionId: version.id, status: 'ready' as const }
          : p
      ),
    })),

  addMessage: (pluginId, message) =>
    set((s) => ({
      plugins: s.plugins.map((p) =>
        p.id === pluginId ? { ...p, messages: [...p.messages, message] } : p
      ),
    })),

  rollbackToVersion: (pluginId, versionId) =>
    set((s) => ({
      plugins: s.plugins.map((p) => {
        if (p.id !== pluginId) return p;
        const version = p.versions.find((v) => v.id === versionId);
        if (!version) return p;
        return {
          ...p,
          currentVersionId: versionId,
          faustCode: version.faustCode,
          params: version.params,
          prompt: version.prompt,
          uiSpec: version.uiSpec,
        };
      }),
    })),

  updatePluginFromVersion: (pluginId, versionId) =>
    set((s) => ({
      plugins: s.plugins.map((p) => {
        if (p.id !== pluginId) return p;
        const version = p.versions.find((v) => v.id === versionId);
        if (!version) return p;
        return {
          ...p,
          currentVersionId: versionId,
          faustCode: version.faustCode,
          params: version.params,
          prompt: version.prompt,
          name: version.prompt.slice(0, 24),
          uiSpec: version.uiSpec,
        };
      }),
    })),

  setPreviewMode: (pluginId, mode) =>
    set((state) => ({
      plugins: state.plugins.map((p) =>
        p.id === pluginId ? { ...p, previewMode: mode } : p
      ),
    })),

  setPreviewSample: (pluginId, sampleName, sampleBuffer) =>
    set((state) => ({
      plugins: state.plugins.map((p) =>
        p.id === pluginId ? { ...p, previewSampleName: sampleName, previewSampleBuffer: sampleBuffer } : p
      ),
    })),

  updateVersionQualityLabels: (pluginId, versionId, qualityLabels) =>
    set((state) => ({
      plugins: state.plugins.map((plugin) =>
        plugin.id !== pluginId
          ? plugin
          : {
              ...plugin,
              versions: plugin.versions.map((version) =>
                version.id === versionId ? { ...version, qualityLabels } : version
              ),
            }
      ),
    })),
}));
