export const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;
export const SERVER_URL = import.meta.env.VITE_SERVER_URL;
export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
export const IS_LOCAL_DEV = !new URLSearchParams(window.location.search).has('frame_id');
const NORMALIZED_SERVER_URL = SERVER_URL?.startsWith('http') ? SERVER_URL : `http://${SERVER_URL ?? 'localhost:3001'}`;

/* When running inside a Discord Activity iframe, all network requests must go to the
   same origin (CSP connect-src restriction). Use window.location.origin instead of
   the external SERVER_URL. */
const SAME_ORIGIN_BASE = typeof window !== 'undefined' ? window.location.origin : '';
export const SERVER_BASE_URL = IS_LOCAL_DEV
  ? NORMALIZED_SERVER_URL
  : SAME_ORIGIN_BASE;

export function getWsUrl(): string {
  if (!IS_LOCAL_DEV && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  if (SERVER_URL) {
    return NORMALIZED_SERVER_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return 'ws://localhost:3001';
}
