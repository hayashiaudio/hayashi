import { create } from 'zustand';

export interface PluginParam {
  name: string;
  value: number;
  min: number;
  max: number;
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
}));
