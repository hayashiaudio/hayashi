import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getRepoDir, writeFile, ensureRepoDir } from './persist.js';
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const TEST_CHANNEL = 'test-channel-1';
const TEST_BASE_DIR = '/tmp/hayashi';

describe('sync/persist', () => {
  beforeEach(() => {
    const dir = getRepoDir(TEST_CHANNEL);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }
  });

  afterEach(() => {
    const dir = getRepoDir(TEST_CHANNEL);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }
  });

  describe('getRepoDir', () => {
    it('returns a path under /tmp/hayashi', () => {
      const dir = getRepoDir(TEST_CHANNEL);
      expect(dir).toContain(TEST_BASE_DIR);
      expect(dir).toContain(TEST_CHANNEL);
    });

    it('returns different paths for different channelIds', () => {
      const dir1 = getRepoDir('channel-a');
      const dir2 = getRepoDir('channel-b');
      expect(dir1).not.toBe(dir2);
    });
  });

  describe('writeFile', () => {
    it('creates the directory if it does not exist', () => {
      const dir = getRepoDir(TEST_CHANNEL);
      expect(existsSync(dir)).toBe(false);

      writeFile(TEST_CHANNEL, 'src/audio/engine.ts', 'console.log("test")');

      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, 'src/audio'))).toBe(true);
    });

    it('writes file content correctly', () => {
      const content = 'export const test = 42;';
      writeFile(TEST_CHANNEL, 'test.ts', content);

      const dir = getRepoDir(TEST_CHANNEL);
      const written = readFileSync(join(dir, 'test.ts'), 'utf-8');
      expect(written).toBe(content);
    });
  });

  describe('ensureRepoDir', () => {
    it('creates a directory and returns its path', () => {
      const dir = ensureRepoDir(TEST_CHANNEL);
      expect(existsSync(dir)).toBe(true);
      expect(dir).toContain(TEST_CHANNEL);
    });

    it('recreates directory if it already exists', () => {
      const dir1 = ensureRepoDir(TEST_CHANNEL);
      writeFile(TEST_CHANNEL, 'existing.txt', 'old');
      expect(existsSync(join(dir1, 'existing.txt'))).toBe(true);

      const dir2 = ensureRepoDir(TEST_CHANNEL);
      expect(dir1).toBe(dir2);
      expect(existsSync(join(dir2, 'existing.txt'))).toBe(false);
    });
  });
});
