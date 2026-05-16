export const SERVER_URL = import.meta.env.VITE_SERVER_URL;

/* Local dev: explicit SERVER_URL or localhost */
export const IS_LOCAL_DEV =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

const NORMALIZED_SERVER_URL = SERVER_URL?.startsWith('http')
  ? SERVER_URL
  : `http://${SERVER_URL ?? 'localhost:3001'}`;

/* In production (single-container deploy), all requests go to the same origin */
const SAME_ORIGIN_BASE = typeof window !== 'undefined' ? window.location.origin : '';
export const SERVER_BASE_URL = IS_LOCAL_DEV ? NORMALIZED_SERVER_URL : SAME_ORIGIN_BASE;

export function getWsUrl(): string {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return 'ws://localhost:3001';
}

export function getMidiBridgeUrl(): string {
  return `${getWsUrl()}/hayashi-bridge`;
}
