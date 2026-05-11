import { Hono } from 'hono';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { fetchDiscordIdentity } from './billing/discord.js';
import {
  addBillingSubscriber,
  consumeBillingStreamToken,
  mintBillingStreamToken,
  publishBillingUpdate,
  removeBillingSubscriber,
} from './billing/events.js';
import { getBillingRepository } from './billing/repository.js';
import { BillingService, buildBillingContext } from './billing/service.js';
import {
  createBillingPortalSession,
  createCheckoutSession,
  createStripeCustomer,
  extractSubscriptionPatch,
  updateStripeCustomerEmail,
  verifyStripeWebhookSignature,
} from './billing/stripe.js';

const app = new Hono();
const billingRepository = getBillingRepository();
const billing = new BillingService(billingRepository);

function isStripeMissingCustomerError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('No such customer:');
}

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

  try {
    const identity = await fetchDiscordIdentity(body.accessToken);
    const context = buildBillingContext(body.guildId, body.channelId);
    const user = await billing.getOrCreateUser(identity);
    const snapshot = await billing.registerContext(user, context);
    return c.json(snapshot);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Billing bootstrap failed' }, 401);
  }
});

app.post('/billing/checkout', async (c) => {
  const body = await c.req.json<{ accessToken?: string; guildId?: string | null; channelId?: string | null }>();
  if (!body.accessToken) return c.json({ error: 'Missing Discord access token' }, 400);

  try {
    const identity = await fetchDiscordIdentity(body.accessToken);
    const context = buildBillingContext(body.guildId, body.channelId);
    let user = await billing.getOrCreateUser(identity);
    const snapshot = await billing.buildSnapshot(user, context);

    if (!snapshot.contextAccess.allowed && snapshot.contextAccess.reason !== 'installation_limit') {
      return c.json(snapshot, 403);
    }

    if (!user.stripeCustomerId) {
      const customer = await createStripeCustomer({
        discordUserId: user.discordUserId,
        username: user.discordUsername,
        email: user.email,
      });
      user = await billing.updateStripeCustomer(user, customer.id);
    } else if (user.email) {
      try {
        await updateStripeCustomerEmail({
          customerId: user.stripeCustomerId,
          email: user.email,
          username: user.discordUsername,
        });
      } catch (error) {
        if (!isStripeMissingCustomerError(error)) throw error;
        await billing.setStripeCustomerId(user, null);
        const customer = await createStripeCustomer({
          discordUserId: user.discordUserId,
          username: user.discordUsername,
          email: user.email,
        });
        user = await billing.updateStripeCustomer(user, customer.id);
      }
    }

    const baseUrl = new URL(c.req.url).origin;
    let session;
    try {
      session = await createCheckoutSession({
        customerId: user.stripeCustomerId!,
        discordUserId: user.discordUserId,
        successUrl: `${baseUrl}/?billing=success`,
        cancelUrl: `${baseUrl}/?billing=cancel`,
      });
    } catch (error) {
      if (!isStripeMissingCustomerError(error)) throw error;

      await billing.setStripeCustomerId(user, null);
      const customer = await createStripeCustomer({
        discordUserId: user.discordUserId,
        username: user.discordUsername,
        email: user.email,
      });
      user = await billing.updateStripeCustomer(user, customer.id);
      session = await createCheckoutSession({
        customerId: user.stripeCustomerId!,
        discordUserId: user.discordUserId,
        successUrl: `${baseUrl}/?billing=success`,
        cancelUrl: `${baseUrl}/?billing=cancel`,
      });
    }

    await billing.attachCheckoutToUser(user.discordUserId, {
      stripeCustomerId: session.customer ?? user.stripeCustomerId,
    });
    await billingRepository.recordCheckoutSession({
      stripeCheckoutSessionId: session.id,
      userId: user.discordUserId,
      stripeCustomerId: session.customer ?? user.stripeCustomerId,
      status: 'open',
      checkoutUrl: session.url ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return c.json({ url: session.url, snapshot: await billing.buildSnapshot(user, context) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to create checkout session' }, 500);
  }
});

app.post('/billing/portal', async (c) => {
  const body = await c.req.json<{ accessToken?: string }>();
  if (!body.accessToken) return c.json({ error: 'Missing Discord access token' }, 400);

  try {
    const identity = await fetchDiscordIdentity(body.accessToken);
    const user = await billing.getOrCreateUser(identity);
    if (!user.stripeCustomerId) {
      return c.json({ error: 'No Stripe customer found for this account' }, 404);
    }
    const baseUrl = new URL(c.req.url).origin;
    let portal;
    try {
      portal = await createBillingPortalSession({
        customerId: user.stripeCustomerId,
        returnUrl: `${baseUrl}/`,
      });
    } catch (error) {
      if (!isStripeMissingCustomerError(error)) throw error;
      await billing.setStripeCustomerId(user, null);
      return c.json({ error: 'Stripe customer was deleted. Start a new checkout session to restore billing.' }, 404);
    }
    return c.json({ url: portal.url });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to create portal session' }, 500);
  }
});

app.post('/billing/stream-token', async (c) => {
  const body = await c.req.json<{ accessToken?: string; guildId?: string | null; channelId?: string | null }>();
  if (!body.accessToken) return c.json({ error: 'Missing Discord access token' }, 400);

  try {
    const identity = await fetchDiscordIdentity(body.accessToken);
    const context = buildBillingContext(body.guildId, body.channelId);
    const user = await billing.getOrCreateUser(identity);
    const token = mintBillingStreamToken(user.discordUserId, context);
    return c.json({ token });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to create stream token' }, 500);
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
    const snapshot = await billing.authorizeExport(user, context);
    return c.json(snapshot, snapshot.contextAccess.allowed ? 200 : 403);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to authorize export' }, 500);
  }
});

app.post('/stripe/webhook', async (c) => {
  const payload = await c.req.text();
  const signature = c.req.header('Stripe-Signature');
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) return c.json({ error: 'Stripe webhook secret is not configured' }, 500);
  if (!verifyStripeWebhookSignature(payload, signature, endpointSecret)) {
    return c.json({ error: 'Invalid Stripe signature' }, 400);
  }

  const event = JSON.parse(payload) as {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  const eventObject = event.data?.object;
  const customerId = typeof eventObject?.customer === 'string' ? eventObject.customer : null;
  const subscriptionId =
    typeof eventObject?.id === 'string'
      ? eventObject.id
      : typeof eventObject?.subscription === 'string'
        ? eventObject.subscription
        : null;

  if (event.id) {
    const result = await billingRepository.recordBillingEvent({
      stripeEventId: event.id,
      eventType: event.type ?? 'unknown',
      customerId,
      subscriptionId,
      payloadJson: payload,
      status: 'received',
      processedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (result === 'unchanged') {
      return c.json({ received: true, duplicate: true });
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object as {
      id?: string | null;
      customer?: string | null;
      subscription?: string | null;
      client_reference_id?: string | null;
      customer_details?: { email?: string | null } | null;
    } | undefined;
    const discordUserId = session?.client_reference_id ?? null;
    if (discordUserId) {
      await billing.attachCheckoutToUser(discordUserId, {
        stripeCustomerId: session?.customer ?? null,
        stripeSubscriptionId: session?.subscription ?? null,
        email: session?.customer_details?.email ?? null,
      });
      if (session?.id) {
        await billingRepository.recordCheckoutSession({
          stripeCheckoutSessionId: session.id,
          userId: discordUserId,
          stripeCustomerId: session.customer ?? null,
          status: 'completed',
          checkoutUrl: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const patch = extractSubscriptionPatch(event);
    if (patch?.customerId) {
      const updated = await billing.upsertSubscriptionForCustomer(patch.customerId, {
        subscriptionId: patch.subscriptionId,
        priceId: patch.priceId,
        status: patch.status,
        currentPeriodEnd: patch.currentPeriodEnd,
      });
      if (updated) await publishBillingUpdate(billing, updated);
    }
  }

  if (event.id) {
    await billingRepository.recordBillingEvent({
      stripeEventId: event.id,
      eventType: event.type ?? 'unknown',
      customerId,
      subscriptionId,
      payloadJson: payload,
      status: 'processed',
      processedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  return c.json({ received: true });
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
    path.startsWith('/project') ||
    path.startsWith('/billing') ||
    path.startsWith('/stripe')
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
