import { create } from 'zustand';
import type { TransportState, UserPresence, Asset, PatchNode, PatchEdge, Clip, Track } from '@/types/project';
import type { BillingBlockReason, BillingSnapshot, BillingState } from '@/types/billing';

interface ProjectState {
  channelId: string | null;
  guildId: string | null;
  accessToken: string | null;
  projectId: string | null;
  projectTitle: string;
  user: { id: string; username: string; avatar: string | null } | null;

  selectedNodeId: string | null;
  selectedClipId: string | null;
  previewDrawerOpen: boolean;
  exportPanelOpen: boolean;
  workstationEditorNodeId: string | null;
  drumKitEditorNodeId: string | null;
  browserQuery: string;

  collaborators: UserPresence[];

  localTransport: TransportState;

  assets: Record<string, Asset>;
  nodes: Record<string, PatchNode>;
  edges: Record<string, PatchEdge>;
  clips: Record<string, Clip>;
  tracks: Record<string, Track>;
  billing: BillingState;

  setChannelId: (id: string | null) => void;
  setGuildId: (id: string | null) => void;
  setAccessToken: (token: string | null) => void;
  setProjectId: (id: string | null) => void;
  setProjectTitle: (title: string) => void;
  setUser: (user: { id: string; username: string; avatar: string | null } | null) => void;
  selectNode: (id: string | null) => void;
  selectClip: (id: string | null) => void;
  togglePreviewDrawer: () => void;
  toggleExportPanel: () => void;
  openWorkstationEditor: (nodeId: string) => void;
  closeWorkstationEditor: () => void;
  openDrumKitEditor: (nodeId: string) => void;
  closeDrumKitEditor: () => void;
  updateDrumPadKit: (nodeId: string, assignments: Record<string, number | string | boolean>) => void;
  setBrowserQuery: (q: string) => void;
  setCollaborators: (c: UserPresence[]) => void;
  updateLocalTransport: (t: Partial<TransportState>) => void;

  broadcastCursor: ((x: number, y: number) => void) | null;
  setBroadcastCursor: (fn: ((x: number, y: number) => void) | null) => void;
  broadcastFocus: ((nodeId: string | null, param?: string) => void) | null;
  setBroadcastFocus: (fn: ((nodeId: string | null, param?: string) => void) | null) => void;
  setBillingLoading: (loading: boolean) => void;
  setBillingSnapshot: (snapshot: BillingSnapshot | null) => void;
  setBillingError: (error: string | null) => void;
  openPaywall: (reason: BillingBlockReason, message: string) => void;
  closePaywall: () => void;

  setAssets: (assets: Record<string, Asset>) => void;
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;

  setNodes: (nodes: Record<string, PatchNode>) => void;
  addNode: (node: PatchNode) => void;
  removeNode: (id: string) => void;
  updateNodeParams: (id: string, params: Record<string, number | string | boolean>) => void;
  updateNodeMuted: (id: string, muted: boolean) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;

  setEdges: (edges: Record<string, PatchEdge>) => void;
  addEdge: (edge: PatchEdge) => void;
  removeEdge: (id: string) => void;

  setClips: (clips: Record<string, Clip>) => void;
  addClip: (clip: Clip) => void;
  removeClip: (id: string) => void;

  setTracks: (tracks: Record<string, Track>) => void;
  addTrack: (track: Track) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;

  updateClipTiming: (id: string, startBeat: number, lengthBeats: number) => void;
  updateClipLoop: (id: string, loop: boolean) => void;
  moveClip: (id: string, trackId: string, startBeat: number) => void;
  splitClip: (id: string, splitBeat: number) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  channelId: null,
  guildId: null,
  accessToken: null,
  projectId: null,
  projectTitle: 'Untitled Jam',
  user: null,
  selectedNodeId: null,
  selectedClipId: null,
  previewDrawerOpen: false,
  exportPanelOpen: false,
  workstationEditorNodeId: null,
  drumKitEditorNodeId: null,
  browserQuery: '',
  collaborators: [],
  broadcastCursor: null,
  broadcastFocus: null,
  localTransport: {
    playing: false,
    bpm: 128,
    beatOffset: 0,
    timeSignature: [4, 4],
    key: 'D minor',
    scene: 'A',
  },
  assets: {},
  nodes: {},
  edges: {},
  clips: {},
  tracks: {},
  billing: {
    loading: false,
    snapshot: null,
    error: null,
    paywallOpen: false,
    paywallReason: null,
    paywallMessage: null,
  },

  setChannelId: (id) => set({ channelId: id }),
  setGuildId: (id) => set({ guildId: id }),
  setAccessToken: (token) => set({ accessToken: token }),
  setProjectId: (id) => set({ projectId: id }),
  setProjectTitle: (title) => set({ projectTitle: title }),
  setUser: (user) => set({ user }),
  selectNode: (id) => set({ selectedNodeId: id }),
  selectClip: (id) => set({ selectedClipId: id }),
  togglePreviewDrawer: () => set((s) => ({ previewDrawerOpen: !s.previewDrawerOpen })),
  toggleExportPanel: () => set((s) => ({ exportPanelOpen: !s.exportPanelOpen })),
  openWorkstationEditor: (nodeId) => set({ workstationEditorNodeId: nodeId, selectedNodeId: null }),
  closeWorkstationEditor: () => set({ workstationEditorNodeId: null }),
  openDrumKitEditor: (nodeId) => set({ drumKitEditorNodeId: nodeId, selectedNodeId: null }),
  closeDrumKitEditor: () => set({ drumKitEditorNodeId: null }),
  updateDrumPadKit: (nodeId, assignments) =>
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      return {
        nodes: {
          ...s.nodes,
          [nodeId]: { ...node, params: { ...node.params, ...assignments } },
        },
      };
    }),
  setBrowserQuery: (q) => set({ browserQuery: q }),
  setCollaborators: (c) => set({ collaborators: c }),
  updateLocalTransport: (t) => set((s) => ({ localTransport: { ...s.localTransport, ...t } })),
  setBroadcastCursor: (fn) => set({ broadcastCursor: fn }),
  setBroadcastFocus: (fn) => set({ broadcastFocus: fn }),
  setBillingLoading: (loading) => set((s) => ({ billing: { ...s.billing, loading } })),
  setBillingSnapshot: (snapshot) =>
    set((s) => ({
      billing: {
        ...s.billing,
        snapshot,
        loading: false,
        error: null,
      },
    })),
  setBillingError: (error) => set((s) => ({ billing: { ...s.billing, loading: false, error } })),
  openPaywall: (reason, message) =>
    set((s) => ({
      billing: {
        ...s.billing,
        paywallOpen: true,
        paywallReason: reason,
        paywallMessage: message,
      },
    })),
  closePaywall: () =>
    set((s) => ({
      billing: {
        ...s.billing,
        paywallOpen: false,
        paywallReason: null,
        paywallMessage: null,
      },
    })),

  setAssets: (assets) => set({ assets }),
  addAsset: (asset) => set((s) => ({ assets: { ...s.assets, [asset.id]: asset } })),
  removeAsset: (id) =>
    set((s) => {
      const next = { ...s.assets };
      delete next[id];
      return { assets: next };
    }),

  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((s) => ({ nodes: { ...s.nodes, [node.id]: node } })),
  removeNode: (id) =>
    set((s) => {
      const next = { ...s.nodes };
      delete next[id];
      return { nodes: next };
    }),
  updateNodeParams: (id, params) =>
    set((s) => {
      const node = s.nodes[id];
      if (!node) return s;
      return { nodes: { ...s.nodes, [id]: { ...node, params: { ...node.params, ...params } } } }
    }),
  updateNodeMuted: (id, muted) =>
    set((s) => {
      const node = s.nodes[id];
      if (!node) return s;
      return { nodes: { ...s.nodes, [id]: { ...node, muted } } };
    }),
  updateTrack: (id, patch) =>
    set((s) => {
      const track = s.tracks[id];
      if (!track) return s;
      return { tracks: { ...s.tracks, [id]: { ...track, ...patch } } };
    }),
  updateNodePosition: (id, position) =>
    set((s) => {
      const node = s.nodes[id];
      if (!node) return s;
      return { nodes: { ...s.nodes, [id]: { ...node, position } } };
    }),

  setEdges: (edges) => set({ edges }),
  addEdge: (edge) => set((s) => ({ edges: { ...s.edges, [edge.id]: edge } })),
  removeEdge: (id) =>
    set((s) => {
      const next = { ...s.edges };
      delete next[id];
      return { edges: next };
    }),

  setClips: (clips) => set({ clips }),
  addClip: (clip) => set((s) => ({ clips: { ...s.clips, [clip.id]: clip } })),
  removeClip: (id) =>
    set((s) => {
      const next = { ...s.clips };
      delete next[id];
      return { clips: next };
    }),

  updateClipTiming: (id, startBeat, lengthBeats) =>
    set((s) => {
      const clip = s.clips[id];
      if (!clip) return s;
      return { clips: { ...s.clips, [id]: { ...clip, startBeat, lengthBeats } } };
    }),
  updateClipLoop: (id, loop) =>
    set((s) => {
      const clip = s.clips[id];
      if (!clip) return s;
      return { clips: { ...s.clips, [id]: { ...clip, loop } } };
    }),
  moveClip: (id, trackId, startBeat) =>
    set((s) => {
      const clip = s.clips[id];
      if (!clip) return s;
      return { clips: { ...s.clips, [id]: { ...clip, trackId, startBeat } } };
    }),

  splitClip: (id, splitBeat) =>
    set((s) => {
      const clip = s.clips[id];
      if (!clip) return s;
      const absoluteSplit = splitBeat;
      if (absoluteSplit <= clip.startBeat + 0.5 || absoluteSplit >= clip.startBeat + clip.lengthBeats - 0.5) return s;

      const leftLength = absoluteSplit - clip.startBeat;
      const rightStart = absoluteSplit;
      const rightLength = clip.startBeat + clip.lengthBeats - absoluteSplit;

      const leftClip = { ...clip, id: `${clip.id}-L-${crypto.randomUUID().slice(0, 4)}`, lengthBeats: leftLength };
      const rightClip = { ...clip, id: `${clip.id}-R-${crypto.randomUUID().slice(0, 4)}`, startBeat: rightStart, lengthBeats: rightLength };

      const next = { ...s.clips };
      delete next[id];
      next[leftClip.id] = leftClip;
      next[rightClip.id] = rightClip;
      return { clips: next };
    }),

  setTracks: (tracks) => set({ tracks }),
  addTrack: (track) => set((s) => ({ tracks: { ...s.tracks, [track.id]: track } })),
  removeTrack: (id) =>
    set((s) => {
      const next = { ...s.tracks };
      delete next[id];
      return { tracks: next };
    }),
}));
