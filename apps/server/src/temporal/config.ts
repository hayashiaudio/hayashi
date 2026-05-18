const rawNamespace = process.env.TEMPORAL_NAMESPACE?.trim() ?? '';
const rawApiKey = process.env.TEMPORAL_API_KEY?.trim() ?? '';
const rawHost = process.env.TEMPORAL_HOST?.trim() ?? '';

function normalizeAddress(host: string, namespace: string): string {
  const base = host || (namespace ? `${namespace}.tmprl.cloud` : '');
  if (!base) return '';
  return base.includes(':') ? base : `${base}:7233`;
}

export const TEMPORAL_NAMESPACE = rawNamespace;
export const TEMPORAL_API_KEY = rawApiKey;
export const TEMPORAL_ADDRESS = normalizeAddress(rawHost, rawNamespace);
export const TEMPORAL_ENABLED = !!(TEMPORAL_NAMESPACE && TEMPORAL_API_KEY);
