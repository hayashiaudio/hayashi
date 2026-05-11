import { describe, test, expect, vi } from 'vitest';

vi.stubGlobal('window', {
  location: { search: '' },
});
import * as Y from 'yjs';
import { diffRecord } from '../useYjsProject';

describe('diffRecord', () => {
  test('detects added entities', () => {
    const prev = {};
    const next = { a: { id: 'a', x: 1 } };
    const diff = diffRecord(prev, next);
    expect(diff.added).toEqual(next);
    expect(diff.removed).toEqual([]);
    expect(diff.updated).toEqual([]);
  });

  test('detects removed entities', () => {
    const prev = { a: { id: 'a', x: 1 } };
    const next = {};
    const diff = diffRecord(prev, next);
    expect(diff.added).toEqual({});
    expect(diff.removed).toEqual(['a']);
    expect(diff.updated).toEqual([]);
  });

  test('detects updated properties', () => {
    const prev = { a: { id: 'a', x: 1, y: 2 } };
    const next = { a: { id: 'a', x: 10, y: 2 } };
    const diff = diffRecord(prev, next);
    expect(diff.updated).toEqual([{ id: 'a', changes: { x: 10 } }]);
  });

  test('ignores unchanged entities', () => {
    const prev = { a: { id: 'a', x: 1 } };
    const next = { a: { id: 'a', x: 1 } };
    const diff = diffRecord(prev, next);
    expect(diff.added).toEqual({});
    expect(diff.removed).toEqual([]);
    expect(diff.updated).toEqual([]);
  });

  test('detects multiple changes at once', () => {
    const prev = { a: { id: 'a', x: 1 }, b: { id: 'b', x: 2 } };
    const next = { a: { id: 'a', x: 10 }, c: { id: 'c', x: 3 } };
    const diff = diffRecord(prev, next);
    expect(Object.keys(diff.added)).toEqual(['c']);
    expect(diff.removed).toEqual(['b']);
    expect(diff.updated).toEqual([{ id: 'a', changes: { x: 10 } }]);
  });
});

describe('Yjs granular sync', () => {
  test('two docs converge on node position change', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Simulate shared state: doc1 has a node
    const nodes1 = doc1.getMap<Y.Map<unknown>>('nodes');
    const nodeMap = new Y.Map<unknown>();
    nodeMap.set('id', 'node-1');
    nodeMap.set('kind', 'oscillator');
    nodeMap.set('position', { x: 0, y: 0 });
    nodes1.set('node-1', nodeMap);

    // Sync doc1 state to doc2 via update
    const update = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update);

    // Verify doc2 received the node
    const nodes2 = doc2.getMap<Y.Map<unknown>>('nodes');
    const received = nodes2.get('node-1');
    expect(received?.get('position')).toEqual({ x: 0, y: 0 });

    // Change position in doc2
    doc2.transact(() => {
      received?.set('position', { x: 100, y: 200 });
    });

    // Sync back to doc1
    const update2 = Y.encodeStateAsUpdate(doc2);
    Y.applyUpdate(doc1, update2);

    // Verify doc1 has new position
    expect(nodes1.get('node-1')?.get('position')).toEqual({ x: 100, y: 200 });
  });

  test('entity removal propagates across docs', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const nodes1 = doc1.getMap<Y.Map<unknown>>('nodes');
    const nodeMap = new Y.Map<unknown>();
    nodeMap.set('id', 'node-1');
    nodeMap.set('kind', 'oscillator');
    nodes1.set('node-1', nodeMap);

    // Sync doc1 to doc2
    const update = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update);

    // Verify doc2 received the node
    const nodes2 = doc2.getMap<Y.Map<unknown>>('nodes');
    expect(nodes2.get('node-1')).toBeDefined();

    // Delete node in doc2
    doc2.transact(() => {
      nodes2.delete('node-1');
    });

    // Sync back to doc1
    const update2 = Y.encodeStateAsUpdate(doc2);
    Y.applyUpdate(doc1, update2);

    // Verify doc1 removed the node
    expect(nodes1.get('node-1')).toBeUndefined();
  });
});
