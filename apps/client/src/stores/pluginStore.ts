import { create } from 'zustand';

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
  createdAt: number;
}

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
  waveform: number[];
  faustCode: string;
  wasmUrl: string | null;
  createdAt: number;

  // Thread support
  versions: PluginVersion[];
  messages: PluginMessage[];
  currentVersionId: string | null;
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

  // Thread actions
  addVersion: (pluginId: string, version: PluginVersion) => void;
  addMessage: (pluginId: string, message: PluginMessage) => void;
  rollbackToVersion: (pluginId: string, versionId: string) => void;
  updatePluginFromVersion: (pluginId: string, versionId: string) => void;
}

export const usePluginStore = create<PluginState>((set) => ({
  plugins: [],
  activePluginId: null,
  selectedStyle: 'disco',
  previewPlaying: false,

  setActivePlugin: (id) => set({ activePluginId: id }),
  setSelectedStyle: (style) => set({ selectedStyle: style }),
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
        };
      }),
    })),
}));
