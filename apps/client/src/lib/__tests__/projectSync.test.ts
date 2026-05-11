import { describe, test, expect } from 'vitest';
import * as Y from 'yjs';
import {
  hydrateYjsFromSnapshot,
  extractSnapshotFromYjs,
  type RealtimeProjectSnapshot,
} from '../projectSync';

const sampleSnapshot: RealtimeProjectSnapshot = {
  projectTitle: 'Test Jam',
  localTransport: {
    playing: false,
    bpm: 128,
    beatOffset: 0,
    timeSignature: [4, 4],
    key: 'D minor',
    scene: 'A',
    startedAtServerTime: 1_700_000_000,
  },
  nodes: {
    'node-1': {
      id: 'node-1',
      kind: 'oscillator',
      position: { x: 100, y: 200 },
      params: { frequency: 440, wave: 'sine', enabled: true },
    },
  },
  edges: {
    'edge-1': {
      id: 'edge-1',
      sourceNodeId: 'node-1',
      sourcePort: 'out',
      targetNodeId: 'node-2',
      targetPort: 'in',
      signalType: 'audio',
    },
  },
  assets: {
    'asset-1': {
      id: 'asset-1',
      kind: 'sample',
      name: 'Kick.wav',
      mimeType: 'audio/wav',
      durationSeconds: 1.2,
      sampleRate: 48000,
      channels: 2,
    },
  },
  clips: {
    'clip-1': {
      id: 'clip-1',
      trackId: 'track-1',
      type: 'midi',
      startBeat: 0,
      lengthBeats: 4,
      loop: false,
    },
  },
  tracks: {
    'track-1': {
      id: 'track-1',
      name: 'Lead',
      color: '#ed922f',
    },
  },
};

describe('hydrateYjsFromSnapshot', () => {
  test('populates projectMeta', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);
    const meta = ydoc.getMap('projectMeta');
    expect(meta.get('title')).toBe('Test Jam');
    expect(meta.get('bpm')).toBe(128);
  });

  test('populates nodes with nested Y.Map', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);
    const nodes = ydoc.getMap('nodes');
    const node1 = nodes.get('node-1') as Y.Map<unknown>;
    expect(node1.get('kind')).toBe('oscillator');
    expect(node1.get('position')).toEqual({ x: 100, y: 200 });
    expect(node1.get('params')).toEqual({ frequency: 440, wave: 'sine', enabled: true });
  });

  test('populates edges', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);
    const edges = ydoc.getMap('edges');
    const edge1 = edges.get('edge-1') as Y.Map<unknown>;
    expect(edge1.get('signalType')).toBe('audio');
  });

  test('populates clips and tracks', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);
    const clips = ydoc.getMap('clips');
    const clip1 = clips.get('clip-1') as Y.Map<unknown>;
    expect(clip1.get('trackId')).toBe('track-1');
    const tracks = ydoc.getMap('tracks');
    const track1 = tracks.get('track-1') as Y.Map<unknown>;
    expect(track1.get('name')).toBe('Lead');
  });

  test('populates assets', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);
    const assets = ydoc.getMap('assets');
    const asset1 = assets.get('asset-1') as Y.Map<unknown>;
    expect(asset1.get('name')).toBe('Kick.wav');
    expect(asset1.get('kind')).toBe('sample');
  });

  test('clears previous state on re-hydration', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);

    const second: RealtimeProjectSnapshot = {
      ...sampleSnapshot,
      projectTitle: 'Rehydrated',
      nodes: {},
      edges: {},
      clips: {},
      tracks: {},
      assets: {},
    };
    hydrateYjsFromSnapshot(second, ydoc);

    const meta = ydoc.getMap('projectMeta');
    expect(meta.get('title')).toBe('Rehydrated');

    const nodes = ydoc.getMap('nodes');
    expect(nodes.size).toBe(0);
  });
});

describe('extractSnapshotFromYjs', () => {
  test('round-trips all entity types', () => {
    const ydoc = new Y.Doc();
    hydrateYjsFromSnapshot(sampleSnapshot, ydoc);
    const extracted = extractSnapshotFromYjs(ydoc);
    expect(extracted).toEqual(sampleSnapshot);
  });

  test('handles empty project', () => {
    const ydoc = new Y.Doc();
    const empty: RealtimeProjectSnapshot = {
      projectTitle: 'Untitled Jam',
      localTransport: {
        playing: false,
        bpm: 128,
        beatOffset: 0,
        timeSignature: [4, 4],
        key: 'D minor',
        scene: 'A',
      },
      nodes: {},
      edges: {},
      assets: {},
      clips: {},
      tracks: {},
    };
    hydrateYjsFromSnapshot(empty, ydoc);
    expect(extractSnapshotFromYjs(ydoc)).toEqual(empty);
  });
});
