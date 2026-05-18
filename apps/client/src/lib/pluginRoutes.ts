export interface PluginRoute {
  kind: 'home' | 'plugin';
  pluginId?: string;
  pluginSlug?: string;
}

export function slugifyPluginName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'plugin';
}

export function buildPluginPath(pluginId: string, pluginName: string): string {
  return `/plugins/${encodeURIComponent(pluginId)}/${encodeURIComponent(slugifyPluginName(pluginName))}`;
}

export function parsePluginRoute(pathname: string): PluginRoute {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (cleanPath === '/') return { kind: 'home' };

  const match = cleanPath.match(/^\/plugins\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return { kind: 'home' };

  return {
    kind: 'plugin',
    pluginId: decodeURIComponent(match[1]),
    pluginSlug: match[2] ? decodeURIComponent(match[2]) : undefined,
  };
}
