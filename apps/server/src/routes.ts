import { Hono } from 'hono';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { fetchDiscordIdentity } from './billing/discord.js';
import { uploadAsset, getPublicAssetUrl } from './storage.js';
import {
  addBillingSubscriber,
  consumeBillingStreamToken,
  mintBillingStreamToken,
  publishBillingUpdate,
  removeBillingSubscriber,
} from './billing/events.js';
import { getBillingRepository } from './billing/repository.js';
import { BillingService, buildBillingContext } from './billing/service.js';

const app = new Hono();
const billingRepository = getBillingRepository();
const billing = new BillingService(billingRepository);

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

app.post('/billing/bootstrap', async (c) => {
  const body = await c.req.json<{ accessToken?: string; guildId?: string | null; channelId?: string | null }>();
  if (!body.accessToken) return c.json({ error: 'Missing Discord access token' }, 400);

  let identity;
  try {
    identity = await fetchDiscordIdentity(body.accessToken);
  } catch {
    return c.json({ error: 'Discord identity lookup failed' }, 401);
  }

  try {
    const context = buildBillingContext(body.guildId, body.channelId);
    const user = await billing.getOrCreateUser(identity);
    const synced = await billing.syncEntitlements(user);
    const snapshot = await billing.registerContext(synced, context);
    return c.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing bootstrap failed';
    console.error('[Hayashi] Billing bootstrap error:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/billing/stream-token', async (c) => {
  const body = await c.req.json<{ accessToken?: string; guildId?: string | null; channelId?: string | null }>();
  if (!body.accessToken) return c.json({ error: 'Missing Discord access token' }, 400);

  let identity;
  try {
    identity = await fetchDiscordIdentity(body.accessToken);
  } catch {
    return c.json({ error: 'Discord identity lookup failed' }, 401);
  }

  try {
    const context = buildBillingContext(body.guildId, body.channelId);
    const user = await billing.getOrCreateUser(identity);
    const token = mintBillingStreamToken(user.discordUserId, context);
    return c.json({ token });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create stream token';
    console.error('[Hayashi] Billing stream-token error:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/billing/events', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Missing billing stream token' }, 400);

  const streamToken = consumeBillingStreamToken(token);
  if (!streamToken) return c.json({ error: 'Invalid or expired billing stream token' }, 401);

  const user = await billingRepository.getUser(streamToken.discordUserId);
  if (!user) return c.json({ error: 'Billing user not found' }, 404);

  let subscriberId = '';
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      Promise.resolve(billing.buildSnapshot(user, streamToken.context)).then((snapshot) => {
        send('billing.ready', snapshot);
      }).catch(() => {
        try {
          controller.error(new Error('Failed to initialize billing stream'));
        } catch {
          // no-op
        }
      });

      subscriberId = addBillingSubscriber({
        discordUserId: streamToken.discordUserId,
        context: streamToken.context,
        send: (event, snapshot) => send(event, snapshot),
        close: () => {
          if (heartbeat) clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // stream already closed
          }
        },
      });

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive\n\n`));
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (subscriberId) removeBillingSubscriber(subscriberId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});

app.post('/billing/export/authorize', async (c) => {
  const body = await c.req.json<{ accessToken?: string; guildId?: string | null; channelId?: string | null }>();
  if (!body.accessToken) return c.json({ error: 'Missing Discord access token' }, 400);

  try {
    const identity = await fetchDiscordIdentity(body.accessToken);
    const context = buildBillingContext(body.guildId, body.channelId);
    const user = await billing.getOrCreateUser(identity);
    const synced = await billing.syncEntitlements(user);
    const snapshot = await billing.authorizeExport(synced, context);
    return c.json(snapshot, snapshot.contextAccess.allowed ? 200 : 403);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to authorize export' }, 500);
  }
});

import { getDb, ensureDbSchema, hasDatabaseUrl } from './db/index.js';
import { projects } from './db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

function saveProjectFile(projectId: string, snapshot: unknown) {
  const dir = resolve('/tmp/hayashi/projects', projectId);
  mkdirSync(dir, { recursive: true });
  const serialized = JSON.stringify(snapshot);
  writeFileSync(resolve(dir, `snapshot-${Date.now()}.json`), serialized);
  writeFileSync(resolve(dir, 'latest.json'), serialized);
}

function loadProjectFile(projectId: string): unknown | null {
  const dir = resolve('/tmp/hayashi/projects', projectId);
  if (!existsSync(dir)) return null;
  const latestPath = resolve(dir, 'latest.json');
  if (!existsSync(latestPath)) return null;
  return JSON.parse(readFileSync(latestPath, 'utf-8'));
}

function listProjectFiles(): Array<{ id: string; title: string; createdAt: number; updatedAt: number }> {
  const root = resolve('/tmp/hayashi/projects');
  if (!existsSync(root)) return [];
  const result: Array<{ id: string; title: string; createdAt: number; updatedAt: number }> = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const latestPath = resolve(root, entry.name, 'latest.json');
    if (!existsSync(latestPath)) continue;
    try {
      const snapshot = JSON.parse(readFileSync(latestPath, 'utf-8')) as Record<string, unknown>;
      const stat = statSync(latestPath);
      result.push({
        id: entry.name,
        title: (snapshot.projectTitle as string) ?? 'Untitled Jam',
        createdAt: stat.birthtimeMs,
        updatedAt: stat.mtimeMs,
      });
    } catch {
      // ignore corrupted files
    }
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

app.post('/project/save', async (c) => {
  const body = await c.req.json<{ accessToken?: string; projectId: string; snapshot: unknown }>();
  const { accessToken, projectId, snapshot } = body;
  if (!accessToken || !projectId || !snapshot) {
    return c.json({ error: 'Missing accessToken, projectId, or snapshot' }, 400);
  }

  let identity;
  try {
    identity = await fetchDiscordIdentity(accessToken);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (hasDatabaseUrl()) {
    try {
      await ensureDbSchema();
      const db = getDb();
      const now = Date.now();

      const createdBy = (snapshot as Record<string, unknown>)?.createdBy as string | undefined;
      if (createdBy && createdBy === identity.id) {
        await billing.getOrCreateUser(identity);
      }

      const channelId = (snapshot as Record<string, unknown>)?.channelId as string | undefined;
      await db
        .insert(projects)
        .values({
          id: projectId,
          ownerId: (snapshot as Record<string, unknown>)?.createdBy as string ?? 'unknown',
          channelId: channelId ?? null,
          title: (snapshot as Record<string, unknown>)?.projectTitle as string ?? 'Untitled Jam',
          snapshotJson: JSON.stringify(snapshot),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            ownerId: (snapshot as Record<string, unknown>)?.createdBy as string ?? 'unknown',
            channelId: channelId ?? null,
            title: (snapshot as Record<string, unknown>)?.projectTitle as string ?? 'Untitled Jam',
            snapshotJson: JSON.stringify(snapshot),
            updatedAt: now,
          },
        });

      return c.json({ saved: true });
    } catch (err) {
      console.error('[Hayashi] DB project save failed:', err);
      return c.json({ error: 'Database error' }, 500);
    }
  }

  saveProjectFile(projectId, snapshot);
  return c.json({ saved: true });
});

app.get('/project/load/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  const accessToken = c.req.query('accessToken');
  if (!accessToken) return c.json({ error: 'Missing accessToken' }, 400);

  try {
    await fetchDiscordIdentity(accessToken);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (hasDatabaseUrl()) {
    try {
      await ensureDbSchema();
      const db = getDb();

      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!rows[0]) return c.json({ error: 'Project not found' }, 404);

      return c.json({ snapshot: JSON.parse(rows[0].snapshotJson) });
    } catch (err) {
      console.error('[Hayashi] DB project load failed:', err);
      return c.json({ error: 'Database error' }, 500);
    }
  }

  const snapshot = loadProjectFile(projectId);
  if (!snapshot) return c.json({ error: 'Project not found' }, 404);
  return c.json({ snapshot });
});

app.get('/projects/list', async (c) => {
  const accessToken = c.req.query('accessToken');
  const channelId = c.req.query('channelId');
  if (!accessToken) return c.json({ error: 'Missing accessToken' }, 400);

  try {
    await fetchDiscordIdentity(accessToken);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (hasDatabaseUrl()) {
    try {
      await ensureDbSchema();
      const db = getDb();

      const conditions = [];
      if (channelId) {
        conditions.push(eq(projects.channelId, channelId));
      }
      const rows = await db
        .select({ id: projects.id, title: projects.title, channelId: projects.channelId, createdAt: projects.createdAt, updatedAt: projects.updatedAt })
        .from(projects)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(projects.updatedAt));

      return c.json({ projects: rows });
    } catch (err) {
      console.error('[Hayashi] DB project list failed:', err);
      return c.json({ error: 'Database error' }, 500);
    }
  }

  return c.json({ projects: listProjectFiles() });
});

app.post('/assets/upload', async (c) => {
  try {
    const body = await c.req.arrayBuffer();
    console.log(`[Hayashi] Upload received: ${body.byteLength} bytes`);
    const assetId = randomUUID();
    const publicUrl = await uploadAsset(assetId, Buffer.from(body));
    console.log(`[Hayashi] Upload saved to Tigris: ${assetId} (${body.byteLength} bytes) -> ${publicUrl}`);
    return c.json({ assetId, url: publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload save failed';
    console.error('[Hayashi] Upload error:', msg);
    return c.json({ error: msg }, 500);
  }
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

  /* Second: redirect to Tigris public URL for user-uploaded assets */
  const publicUrl = getPublicAssetUrl(assetId);
  const isDownload = c.req.query('download') === '1';
  const filename = c.req.query('filename') || assetId;
  if (isDownload) {
    /* Tigris doesn't support Content-Disposition query params, so we proxy
       through a 302 with a response header. The browser will use the
       original URL's Content-Disposition if set by the server, but Tigris
       won't. For true forced-download, we need a small proxy or pre-signed
       URL with response-content-disposition. */
    return c.redirect(publicUrl + `?response-content-disposition=${encodeURIComponent(`attachment; filename="${filename}"`)}`, 302);
  }

  return c.redirect(publicUrl, 302);
});

app.get('*', (c) => {
  const path = c.req.path;
  if (
    path.startsWith('/health') ||
    path.startsWith('/project') ||
    path.startsWith('/billing')
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
