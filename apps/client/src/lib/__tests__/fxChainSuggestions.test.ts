import { describe, test, expect } from 'vitest';
import { getSuggestedProcessorIds } from '../fxChainSuggestions';

const makeNode = (id: string, kind: string) => ({
  id,
  kind,
  position: { x: 0, y: 0 },
  params: {},
});

const makeEdge = (id: string, source: string, target: string, signalType = 'audio') => ({
  id,
  sourceNodeId: source,
  sourcePort: 'out',
  targetNodeId: target,
  targetPort: 'in',
  signalType: signalType as 'audio' | 'midi' | 'control' | 'clock',
});

describe('getSuggestedProcessorIds', () => {
  test('linear chain suggests processors in order', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      d: makeNode('d', 'delay'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f'),
      e2: makeEdge('e2', 'f', 'd'),
      e3: makeEdge('e3', 'd', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, [])).toEqual(['f', 'd']);
  });

  test('excludes processors already in fxChain', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      d: makeNode('d', 'delay'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f'),
      e2: makeEdge('e2', 'f', 'd'),
      e3: makeEdge('e3', 'd', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, ['f'])).toEqual(['d']);
  });

  test('handles branching graph', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      d: makeNode('d', 'delay'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f'),
      e2: makeEdge('e2', 'src', 'd'),
      e3: makeEdge('e3', 'f', 'ws'),
      e4: makeEdge('e4', 'd', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, [])).toEqual(['f', 'd']);
  });

  test('handles circular graph without infinite loop', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      d: makeNode('d', 'delay'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f'),
      e2: makeEdge('e2', 'f', 'd'),
      e3: makeEdge('e3', 'd', 'f'),
      e4: makeEdge('e4', 'd', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, [])).toEqual(['f', 'd']);
  });

  test('returns empty when no source or workstation', () => {
    expect(getSuggestedProcessorIds(undefined, 'ws', {}, {}, [])).toEqual([]);
    expect(getSuggestedProcessorIds('src', undefined, {}, {}, [])).toEqual([]);
  });

  test('returns empty when source is same as workstation', () => {
    expect(getSuggestedProcessorIds('same', 'same', {}, {}, [])).toEqual([]);
  });

  test('returns empty when source node is absent from nodes', () => {
    const nodes = {
      ws: makeNode('ws', 'workstation'),
    };
    expect(getSuggestedProcessorIds('missing', 'ws', nodes, {}, [])).toEqual([]);
  });

  test('ignores non-audio edges', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      f: makeNode('f', 'filter'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'f', 'midi'),
      e2: makeEdge('e2', 'f', 'ws', 'audio'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, [])).toEqual([]);
  });

  test('traverses through non-processor nodes', () => {
    const nodes = {
      src: makeNode('src', 'sampler'),
      u: makeNode('u', 'workstation'),
      f: makeNode('f', 'filter'),
      ws: makeNode('ws', 'workstation'),
    };
    const edges = {
      e1: makeEdge('e1', 'src', 'u'),
      e2: makeEdge('e2', 'u', 'f'),
      e3: makeEdge('e3', 'f', 'ws'),
    };
    expect(getSuggestedProcessorIds('src', 'ws', nodes, edges, [])).toEqual(['f']);
  });
});
