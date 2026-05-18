import { describe, expect, it } from 'vitest';
import { getCorpusForCategory } from './corpus.js';

describe('optimization corpus', () => {
  it('provides a fixed parametric_eq corpus', () => {
    const corpus = getCorpusForCategory('parametric_eq');
    expect(corpus.length).toBeGreaterThanOrEqual(6);
    expect(corpus.some((item) => item.id === 'eq-vocal')).toBe(true);
    expect(corpus.some((item) => item.id === 'eq-analysis')).toBe(true);
  });
});
