import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { uploadAsset, getPublicAssetUrl } from './storage.js';
import {
  addBillingSubscriber,
  consumeBillingStreamToken,
  mintBillingStreamToken,
  removeBillingSubscriber,
} from './billing/events.js';
import { getBillingRepository } from './billing/repository.js';
import { BillingService, STRIPE_PRICE_CREATOR, STRIPE_PRICE_PRO, STRIPE_PRICE_STUDIO } from './billing/service.js';
import { generateFaustFromPrompt, iterateFaustFromPrompt, inferPluginType } from './faust/generate.js';
import { parseFaustParams, paramsToJson } from './faust/params.js';
import { compileDspToNative } from './export/compiler.js';
import { verifyClerkToken } from './auth/clerk.js';
import {
  createPlugin,
  addVersion,
  addMessage,
  getPluginThread,
  getLatestVersionNumber,
  listPluginsForUser,
} from './plugin/repository.js';

const app = new Hono();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://nation-gamma-statistics-ministers.trycloudflare.com'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

const billingRepository = getBillingRepository();
const billing = new BillingService(billingRepository);

async function verifyAuth(c: any, bodyToken?: string | null) {
  const header = c.req.header('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer ?? bodyToken ?? null;
  if (!token) return null;
  return verifyClerkToken(token);
}

import { handleStripeWebhook } from './billing/stripeWebhook.js';

app.get('/health', (c) => c.json({ status: 'ok', mode: 'plugin-studio' }));

app.post('/billing/webhook', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('stripe-signature') ?? '';
  const result = await handleStripeWebhook(body, signature);
  if (result.received) {
    return c.json({ received: true });
  }
  return c.json({ error: result.message }, 400);
});

app.post('/billing/checkout', async (c) => {
  const identity = await verifyAuth(c);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => ({} as any));
  const plan = body.plan as 'creator' | 'pro' | 'studio';
  if (!plan || !['creator', 'pro', 'studio'].includes(plan)) {
    return c.json({ error: 'Invalid plan' }, 400);
  }

  const stripe = (await import('stripe')).default;
  const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-04-22.dahlia' });

  const priceId = plan === 'creator' ? STRIPE_PRICE_CREATOR
    : plan === 'pro' ? STRIPE_PRICE_PRO
    : STRIPE_PRICE_STUDIO;

  try {
    const user = await billing.getOrCreateUser(identity);
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripeClient.customers.create({
        metadata: { clerkUserId: identity.userId },
      });
      customerId = customer.id;
    }

    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      client_reference_id: identity.userId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${c.req.header('origin') ?? process.env.CLIENT_URL ?? 'http://localhost:5173'}/?studio=${identity.userId}&checkout=success`,
      cancel_url: `${c.req.header('origin') ?? process.env.CLIENT_URL ?? 'http://localhost:5173'}/?studio=${identity.userId}&checkout=canceled`,
    });

    return c.json({ checkoutUrl: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    console.error('[Hayashi] Stripe checkout error:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/billing/bootstrap', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const user = await billing.getOrCreateUser(identity);
    const snapshot = await billing.buildSnapshot(user);
    return c.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing bootstrap failed';
    console.error('[Hayashi] Billing bootstrap error:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/billing/stream-token', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const user = await billing.getOrCreateUser(identity);
    const token = mintBillingStreamToken(user.clerkUserId);
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

  const user = await billingRepository.getUser(streamToken.clerkUserId);
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

      Promise.resolve(billing.buildSnapshot(user)).then((snapshot) => {
        send('billing.ready', snapshot);
      }).catch(() => {
        try {
          controller.error(new Error('Failed to initialize billing stream'));
        } catch {
          // no-op
        }
      });

      subscriberId = addBillingSubscriber({
        clerkUserId: streamToken.clerkUserId,
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
  const body = await c.req.json().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const user = await billing.getOrCreateUser(identity);
    const snapshot = await billing.authorizeExport(user);
    return c.json(snapshot, snapshot.contextAccess.allowed ? 200 : 403);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to authorize export' }, 500);
  }
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
    return c.redirect(publicUrl + `?response-content-disposition=${encodeURIComponent(`attachment; filename="${filename}"`)}`, 302);
  }

  return c.redirect(publicUrl, 302);
});

app.post('/api/plugins', async (c) => {
  const body = await c.req.json<{ accessToken?: string; prompt?: string }>().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  if (!body.prompt || !body.prompt.trim()) return c.json({ error: 'Missing prompt' }, 400);

  // Generation gating
  try {
    const user = await billing.getOrCreateUser(identity);
    const snapshot = await billing.authorizeGeneration(user);
    if (!snapshot.contextAccess.allowed) {
      return c.json({ error: snapshot.contextAccess.message, reason: snapshot.contextAccess.reason }, 403);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing check failed';
    console.error('[Hayashi] Generation billing check failed:', message);
    return c.json({ error: 'Billing check failed' }, 500);
  }

  const pluginId = `plugin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const type = inferPluginType(body.prompt);
  const name = body.prompt.slice(0, 40);

  try {
    await createPlugin({ id: pluginId, ownerId: identity.userId, name, type });

    const faustCode = await generateFaustFromPrompt(body.prompt);
    const params = parseFaustParams(faustCode);

    const versionId = `${pluginId}-v1`;
    await addVersion({
      id: versionId,
      pluginId,
      versionNumber: 1,
      prompt: body.prompt,
      faustCode,
      paramsJson: paramsToJson(params),
    });

    await addMessage({ id: `msg-${Date.now()}-user`, pluginId, role: 'user', content: body.prompt });
    await addMessage({ id: `msg-${Date.now()}-assistant`, pluginId, role: 'assistant', content: faustCode, versionId });

    return c.json({ pluginId, versionId, faustCode, params, type, name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    console.error('[Hayashi] Plugin creation failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/api/plugins/:id/iterate', async (c) => {
  const pluginId = c.req.param('id');
  const body = await c.req.json<{ accessToken?: string; instruction?: string }>().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  if (!body.instruction || !body.instruction.trim()) return c.json({ error: 'Missing instruction' }, 400);

  const thread = await getPluginThread(pluginId);
  if (!thread) return c.json({ error: 'Plugin not found' }, 404);
  if (thread.ownerId !== identity.userId) return c.json({ error: 'Forbidden' }, 403);

  const latestVersion = thread.versions[0];
  if (!latestVersion) return c.json({ error: 'No versions found' }, 404);

  const previousParams = JSON.parse(latestVersion.paramsJson) as { name: string; min: number; max: number }[];
  const previousPrompts = thread.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content);

  const nextVersionNumber = await getLatestVersionNumber(pluginId) + 1;

  try {
    const faustCode = await iterateFaustFromPrompt(
      body.instruction,
      latestVersion.faustCode,
      previousPrompts,
      thread.type as 'synth' | 'effect' | 'percussion',
      previousParams
    );

    const params = parseFaustParams(faustCode);
    const versionId = `${pluginId}-v${nextVersionNumber}`;

    await addVersion({
      id: versionId,
      pluginId,
      versionNumber: nextVersionNumber,
      prompt: body.instruction,
      faustCode,
      paramsJson: paramsToJson(params),
    });

    await addMessage({ id: `msg-${Date.now()}-user`, pluginId, role: 'user', content: body.instruction });
    await addMessage({ id: `msg-${Date.now()}-assistant`, pluginId, role: 'assistant', content: faustCode, versionId });

    return c.json({ pluginId, versionId, versionNumber: nextVersionNumber, faustCode, params });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Iteration failed';
    console.error('[Hayashi] Plugin iteration failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/api/plugins/:id', async (c) => {
  const pluginId = c.req.param('id');
  const identity = await verifyAuth(c, c.req.query('accessToken'));
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const thread = await getPluginThread(pluginId);
  if (!thread) return c.json({ error: 'Plugin not found' }, 404);
  if (thread.ownerId !== identity.userId) return c.json({ error: 'Forbidden' }, 403);

  return c.json({
    id: thread.id,
    name: thread.name,
    type: thread.type,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    versions: thread.versions.map((v) => ({
      ...v,
      params: JSON.parse(v.paramsJson),
    })),
    messages: thread.messages,
  });
});

app.post('/api/generate-faust', async (c) => {
  const body = await c.req.json<{ prompt?: string }>().catch(() => ({} as any));
  const prompt = body.prompt;
  if (!prompt || typeof prompt !== 'string') {
    return c.json({ error: 'prompt required' }, 400);
  }
  try {
    const faustCode = await generateFaustFromPrompt(prompt);
    return c.json({ faustCode, prompt });
  } catch (err) {
    console.error('[FaustGen]', err);
    return c.json({ error: 'generation failed' }, 500);
  }
});

app.post('/api/export/:format', async (c) => {
  const format = c.req.param('format');
  if (format !== 'vst3' && format !== 'clap') {
    return c.json({ error: 'Unsupported format. Use vst3 or clap.' }, 400);
  }

  const body = await c.req.json<{ accessToken?: string; pluginName?: string; pluginId?: string; version?: string; faustCode?: string }>().catch(() => ({} as any));
  if (!body.faustCode || !body.faustCode.trim()) return c.json({ error: 'Missing faustCode' }, 400);
  const MAX_DSP_SIZE = 1024 * 1024;
  if (body.faustCode.length > MAX_DSP_SIZE) {
    return c.json({ error: 'Faust code exceeds maximum size of 1MB' }, 413);
  }
  if (!body.pluginId) return c.json({ error: 'Missing pluginId' }, 400);

  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const safePluginId = (body.pluginId ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const version = (body.version?.trim() || 'v1').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 20);

  try {
    const user = await billing.getOrCreateUser(identity);
    const snapshot = await billing.authorizeExport(user);
    if (!snapshot.contextAccess.allowed) {
      return c.json({ error: snapshot.contextAccess.message, reason: snapshot.contextAccess.reason }, 403);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing check failed';
    console.error('[Hayashi] Export billing check failed:', message, { pluginId: safePluginId, format });
    return c.json({ error: 'Billing check failed' }, 500);
  }

  const pluginName = (body.pluginName ?? 'HayashiPlugin').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);

  try {
    const result = await compileDspToNative(body.faustCode, pluginName, safePluginId, version, format);
    return c.json({ downloadUrl: result.downloadUrl, fromCache: result.fromCache, format });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Compilation failed';
    console.error('[Hayashi] Export compilation failed:', message, { pluginId: safePluginId, pluginName, format });
    return c.json({ error: 'Export compilation failed' }, 500);
  }
});

app.get('*', (c) => {
  const path = c.req.path;
  if (
    path.startsWith('/health') ||
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
