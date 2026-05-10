import { Hono } from 'hono';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok', mode: 'music-lab' }));

app.post('/discord/token', async (c) => {
  const body = await c.req.json<{ code?: string }>();
  const code = body.code;
  const clientId = process.env.VITE_DISCORD_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!code) return c.json({ error: 'Missing Discord authorization code' }, 400);
  if (!clientId || !clientSecret) {
    return c.json({ error: 'Discord OAuth is not configured on the server' }, 500);
  }

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
  });

  const tokenPayload = await tokenResponse.json() as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return c.json({
      error: tokenPayload.error ?? 'Discord token exchange failed',
      error_description: tokenPayload.error_description ?? 'No access token returned',
    }, 502);
  }

  return c.json({
    access_token: tokenPayload.access_token,
    token_type: tokenPayload.token_type ?? 'Bearer',
    expires_in: tokenPayload.expires_in ?? null,
    scope: tokenPayload.scope ?? '',
  });
});

app.post('/project/save', async (c) => {
  const body = await c.req.json<{ projectId: string; snapshot: unknown }>();
  const { projectId, snapshot } = body;
  if (!projectId || !snapshot) return c.json({ error: 'Missing projectId or snapshot' }, 400);

  const dir = resolve('/tmp/hayashi/projects', projectId);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `snapshot-${Date.now()}.json`);
  const serialized = JSON.stringify(snapshot);
  writeFileSync(path, serialized);
  writeFileSync(resolve(dir, 'latest.json'), serialized);
  return c.json({ saved: true, path });
});

app.get('/project/load/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  const dir = resolve('/tmp/hayashi/projects', projectId);
  if (!existsSync(dir)) return c.json({ error: 'Project not found' }, 404);
  const latestPath = resolve(dir, 'latest.json');
  if (!existsSync(latestPath)) return c.json({ error: 'Project not found' }, 404);

  const files = readFileSync(latestPath, 'utf-8');
  return c.json({ snapshot: JSON.parse(files) });
});

app.post('/assets/upload', async (c) => {
  const body = await c.req.arrayBuffer();
  const assetId = randomUUID();
  const dir = resolve('/tmp/hayashi/assets');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, assetId);
  writeFileSync(path, Buffer.from(body));
  return c.json({ assetId, url: `/assets/${assetId}` });
});

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = resolve(__dirname, '../../client/dist');
const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  js: 'application/javascript',
  css: 'text/css',
  png: 'image/png',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  json: 'application/json',
  wav: 'audio/wav',
};

app.get('/assets/:assetId', (c) => {
  const assetId = c.req.param('assetId');

  /* First: try serving from the client build (bundled JS/CSS chunks) */
  const clientAssetPath = resolve(CLIENT_DIST, 'assets', assetId);
  if (existsSync(clientAssetPath)) {
    const content = readFileSync(clientAssetPath);
    const ext = assetId.split('.').pop() ?? '';
    return c.body(content, 200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
  }

  /* Second: fall back to uploaded user assets */
  const uploadedPath = resolve('/tmp/hayashi/assets', assetId);
  if (!existsSync(uploadedPath)) return c.notFound();
  const content = readFileSync(uploadedPath);
  return c.body(content);
});

app.get('*', (c) => {
  const path = c.req.path;
  if (
    path.startsWith('/health') ||
    path.startsWith('/project')
  ) {
    return c.notFound();
  }

  const relativePath = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const filePath = resolve(CLIENT_DIST, relativePath);
  try {
    const content = readFileSync(filePath);
    const ext = relativePath.split('.').pop() ?? '';
    return c.body(content, 200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
  } catch {
    try {
      const indexContent = readFileSync(resolve(CLIENT_DIST, 'index.html'));
      return c.html(indexContent.toString());
    } catch {
      return c.text('Client build not found. Run npm run build in apps/client/', 404);
    }
  }
});

export { app };
