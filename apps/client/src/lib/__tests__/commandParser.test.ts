import { describe, it, expect } from 'vitest';
import { parseCommand } from '../commandParser';

describe('parseCommand', () => {
  it('parses /connect midi', () => {
    const result = parseCommand('/connect midi');
    expect(result.command).toBe('connect');
    expect(result.target).toBe('midi');
  });

  it('parses /connect bluetooth', () => {
    const result = parseCommand('/connect bluetooth');
    expect(result.target).toBe('bluetooth');
  });

  it('returns null for plain text', () => {
    const result = parseCommand('plucky fm bass');
    expect(result.command).toBeNull();
  });
});
