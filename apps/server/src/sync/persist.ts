import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { dirname, join } from 'path';

const BASE_DIR = '/tmp/hayashi';

export function getRepoDir(channelId: string): string {
  return join(BASE_DIR, channelId);
}

export function writeFile(channelId: string, filePath: string, content: string) {
  const fullPath = join(getRepoDir(channelId), filePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

export function ensureRepoDir(channelId: string) {
  const dir = getRepoDir(channelId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}
