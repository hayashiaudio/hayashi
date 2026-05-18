import { create } from 'zustand';

interface SessionState {
  locked: boolean;
  reason: string | null;
  lock: (reason?: string | null) => void;
  unlock: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  locked: false,
  reason: null,
  lock: (reason) => set({ locked: true, reason: reason ?? null }),
  unlock: () => set({ locked: false, reason: null }),
}));
