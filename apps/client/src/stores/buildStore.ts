import { create } from 'zustand';
import type { BuildRecord } from '@/lib/api';

interface BuildState {
  builds: BuildRecord[];
  setBuilds: (builds: BuildRecord[]) => void;
  upsertBuild: (build: BuildRecord) => void;
}

export const useBuildStore = create<BuildState>((set) => ({
  builds: [],
  setBuilds: (builds) => set({ builds }),
  upsertBuild: (build) =>
    set((state) => {
      const existingIndex = state.builds.findIndex((item) => item.id === build.id);
      if (existingIndex === -1) {
        return { builds: [build, ...state.builds].sort((a, b) => b.updatedAt - a.updatedAt) };
      }
      const next = [...state.builds];
      next[existingIndex] = build;
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      return { builds: next };
    }),
}));
