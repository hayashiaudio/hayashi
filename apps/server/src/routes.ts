import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type Stripe from 'stripe';
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
import { persistGeneratedArtifacts } from './faust/artifacts.js';
import { parseFaustParams, paramsToJson } from './faust/params.js';
import { runDelayEchoOptimizationPass, runParametricEqOptimizationPass, runReverbSpaceOptimizationPass, runSynthOptimizationPass } from './optimization/orchestrator.js';
import { getTemporalClient } from './temporal/client.js';
import { getClerkPublicProfile, getDiscordAccountForUser, verifyClerkToken } from './auth/clerk.js';
import {
  createPlugin,
  addVersion,
  addMessage,
  getPluginThread,
  getPluginVersion,
  getLatestVersionNumber,
  listPluginsForUser,
  setVersionQualityLabels,
  updatePluginGenerationState,
  type QualityLabel,
} from './plugin/repository.js';
import {
  createBuild,
  findActiveBuildForVersion,
  getBuild,
  getBuildExecutionPayload,
  listBuildsForUser,
  listBuildLogs,
  updateBuild,
  appendBuildLog,
} from './build/repository.js';
import {
  defaultTargetForFormat,
  formatForTarget,
  isBuildTarget,
  labelForTarget,
  type BuildFormat,
  type BuildTarget,
} from './build/targets.js';
import { verifyBuildRunnerSecret } from './build/github-actions.js';
import { buildGenerationDashboard, logGenerationEvent } from './plugin/observability.js';
import { buildTrainingCorpus } from './plugin/training-corpus.js';
import {
  addSupportMessage,
  createSupportThread,
  getSupportThread,
  hasSupportMessageByDiscordMessageId,
  listSupportThreadsForOwner,
  listSupportThreadsForUser,
  updateSupportThread,
  type SupportThreadWithMessages,
} from './support/repository.js';
import { buildSupportContext } from './support/ai.js';
import { createDmChannel, getDiscordGuildMemberProfile, getDiscordUserProfile, isDiscordGuildMember, isDiscordMutualGuildError, listDiscordMessages, sendDiscordMessage, type DiscordProfile } from './support/discord.js';
import { acceptOnboardingPolicy, getOnboardingStatus, SUPPORT_DISCORD_GUILD_ID, SUPPORT_JOINED_ROLE_ID, SUPPORT_PRIVACY_ROLE_ID, SUPPORT_TERMS_ROLE_ID, SUPPORT_VERIFIED_ROLE_ID } from './support/onboardingService.js';

const app = new Hono();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'https://nation-gamma-statistics-ministers.trycloudflare.com'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use('*', async (c, next) => {
  const host = (c.req.header('host') ?? '').toLowerCase();
  if (host === 'www.tryhayashi.io') {
    const url = new URL(c.req.url);
    url.protocol = 'https:';
    url.host = 'tryhayashi.io';
    return c.redirect(url.toString(), 308);
  }
  await next();
});

const billingRepository = getBillingRepository();
const billing = new BillingService(billingRepository);

async function verifyAuth(c: any, bodyToken?: string | null) {
  const header = c.req.header('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer ?? bodyToken ?? null;
  if (!token) return null;
  return verifyClerkToken(token);
}

function normalizeBuildFormat(value: string | undefined | null): BuildFormat | null {
  if (value === 'vst3' || value === 'clap') return value;
  return null;
}

function normalizeBuildTarget(value: string | undefined | null): BuildTarget | null {
  if (!value || !isBuildTarget(value)) return null;
  return value;
}

async function authorizeSmokeExport(identity: { userId: string }) {
  const user = await billing.getOrCreateUser(identity);
  const snapshot = await billing.authorizeExport(user);
  if (!snapshot.contextAccess.allowed) {
    return { allowed: false as const, snapshot };
  }
  return { allowed: true as const, snapshot };
}

async function queueSmokeExportBuild(args: {
  ownerId: string;
  prompt: string;
  format: BuildFormat;
  pluginName: string;
  pluginType: 'synth' | 'effect' | 'percussion';
  optimizationCategory: 'parametric_eq' | 'synth' | 'reverb_space' | 'delay_echo';
  optimized: {
    artifacts: {
      faustCode: string;
      spec: {
        name?: string;
        toneModel?: string;
        qualityProfile?: string;
        stereoProfile?: string;
      };
      macroControls: unknown;
      uiSpec: unknown;
      metadata: unknown;
    };
    optimizer: {
      winner: {
        architectureId: string;
      };
    };
    score: {
      totalScore: number;
    };
    job: unknown;
  };
}) {
  const pluginId = `plugin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const versionNumber = 1;
  const versionId = `${pluginId}-v${versionNumber}`;
  const params = parseFaustParams(args.optimized.artifacts.faustCode);

  await createPlugin({
    id: pluginId,
    ownerId: args.ownerId,
    name: args.pluginName,
    type: args.pluginType,
  });

  await addVersion({
    id: versionId,
    pluginId,
    versionNumber,
    prompt: args.prompt,
    faustCode: args.optimized.artifacts.faustCode,
    paramsJson: paramsToJson(params),
    specJson: args.optimized.artifacts.spec,
    templateId: args.optimized.optimizer.winner.architectureId,
    toneModel: args.optimized.artifacts.spec.toneModel,
    qualityProfile: args.optimized.artifacts.spec.qualityProfile,
    stereoProfile: args.optimized.artifacts.spec.stereoProfile,
    macroJson: args.optimized.artifacts.macroControls,
    uiSpecJson: args.optimized.artifacts.uiSpec,
    evalMetricsJson: {
      optimizationCategory: args.optimizationCategory,
      smokeTest: true,
      optimizerJob: args.optimized.job,
      optimizerWinner: args.optimized.optimizer.winner,
      scoreSummary: args.optimized.score,
    },
    qualityLabelsJson: [],
    compileErrorsJson: null,
    artifactManifestJson: args.optimized.artifacts.metadata,
  });

  await addMessage({
    id: `msg-${Date.now()}-user`,
    pluginId,
    role: 'user',
    content: args.prompt,
    versionId,
  });
  await addMessage({
    id: `msg-${Date.now()}-assistant`,
    pluginId,
    role: 'assistant',
    content: args.optimized.artifacts.faustCode,
    versionId,
  });

  const buildId = `build-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workflowId = `export-build-${buildId}`;
  await createBuild({
    id: buildId,
    pluginId,
    versionId,
    ownerId: args.ownerId,
    format: args.format,
    target: defaultTargetForFormat(args.format),
    workflowId,
    status: 'queued',
    stage: 'queued',
    statusMessage: `Queued ${args.format.toUpperCase()} smoke build for ${args.pluginName}`,
    metadataJson: {
      requestedPluginName: args.pluginName,
      requestedVersion: `v${versionNumber}`,
      smokeTest: true,
      optimizationCategory: args.optimizationCategory,
      architectureId: args.optimized.optimizer.winner.architectureId,
    },
  });

  const temporalConfigured = !!(process.env.TEMPORAL_NAMESPACE && process.env.TEMPORAL_API_KEY);
  if (temporalConfigured) {
    try {
      const temporal = await getTemporalClient();
      await temporal.workflow.start('exportBuildWorkflow', {
        taskQueue: 'hayashi-plugin-generation',
        workflowId,
        args: [{ buildId }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start export workflow';
      console.error('[Hayashi] Temporal smoke export workflow start failed:', message);
      const { exportBuildActivity } = await import('./temporal/activities.js');
      void exportBuildActivity({ buildId }).catch((activityErr) => {
        const activityMessage = activityErr instanceof Error ? activityErr.message : 'Background export failed';
        console.error('[Hayashi] Inline smoke export activity failed:', activityMessage);
      });
    }
  } else {
    const { exportBuildActivity } = await import('./temporal/activities.js');
    void exportBuildActivity({ buildId }).catch((activityErr) => {
      const activityMessage = activityErr instanceof Error ? activityErr.message : 'Background export failed';
      console.error('[Hayashi] Inline smoke export activity failed:', activityMessage);
    });
  }

  const createdBuild = await getBuild(buildId);
  return {
    pluginId,
    versionId,
    build: createdBuild,
    optimizer: {
      architectureId: args.optimized.optimizer.winner.architectureId,
      score: args.optimized.score.totalScore,
    },
  };
}

function parseVersionFeatures(evalMetricsJson: unknown) {
  if (!evalMetricsJson || typeof evalMetricsJson !== 'object') return null;
  const metrics = evalMetricsJson as Record<string, unknown>;
  const featureSummary = metrics.featureSummary;
  if (!featureSummary || typeof featureSummary !== 'object') return null;
  const summary = featureSummary as Record<string, unknown>;
  return {
    centroid: typeof summary.centroid === 'number' ? summary.centroid : 0,
    rms: typeof summary.rms === 'number' ? summary.rms : 0,
    zcr: typeof summary.zcr === 'number' ? summary.zcr : 0,
    peakDb: typeof summary.peakDb === 'number' ? summary.peakDb : Number.NEGATIVE_INFINITY,
  };
}

function serializePluginThread(thread: Awaited<ReturnType<typeof getPluginThread>>) {
  if (!thread) return null;
  return {
    id: thread.id,
    name: thread.name,
    type: thread.type,
    generationStatus: thread.generationStatus,
    generationError: thread.generationError,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    versions: thread.versions.map((v) => ({
      ...v,
      params: JSON.parse(v.paramsJson),
      qualityLabels: Array.isArray(v.qualityLabelsJson) ? v.qualityLabelsJson : [],
      uiSpec: v.uiSpecJson ?? undefined,
      features: parseVersionFeatures(v.evalMetricsJson),
    })),
    messages: thread.messages,
  };
}

const SUPPORT_OWNER_DISCORD_USER_ID = process.env.SUPPORT_OWNER_DISCORD_USER_ID?.trim() || '1387255717794152519';
const SUPPORT_DISCORD_INVITE_URL = process.env.SUPPORT_DISCORD_INVITE_URL?.trim() || process.env.DISCORD_INVITE_URL?.trim() || null;

interface SupportAttachmentPayload {
  filename: string;
  contentType: string | null;
  url: string;
  size: number | null;
  width: number | null;
  height: number | null;
}

interface SupportEmbedPayload {
  type: string | null;
  url: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  providerName: string | null;
}

interface SupportMessageMetadata {
  author?: {
    discordUserId: string | null;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  };
  attachments?: SupportAttachmentPayload[];
  embeds?: SupportEmbedPayload[];
}

async function resolveSupportIdentity(c: any, bodyToken?: string | null, requestedDiscordUserId?: string | null) {
  const identity = await verifyAuth(c, bodyToken);
  if (!identity) return { error: c.json({ error: 'Unauthorized' }, 401) } as const;

  const discord = await getDiscordAccountForUser(identity.userId);
  if (!discord) return { error: c.json({ error: 'Discord account is required' }, 403) } as const;
  if (requestedDiscordUserId && requestedDiscordUserId !== discord.providerUserId) {
    return { error: c.json({ error: 'Discord account mismatch' }, 403) } as const;
  }

  return {
    identity,
    discord,
    isOwner: discord.providerUserId === SUPPORT_OWNER_DISCORD_USER_ID,
  } as const;
}

async function refreshSupportContext(thread: SupportThreadWithMessages) {
  const aiContext = await buildSupportContext(thread.messages);
  await updateSupportThread({
    id: thread.id,
    contextSummary: aiContext.summary,
    contextJson: aiContext.context,
  });
}

async function getSupportProfile(discordUserId: string): Promise<DiscordProfile> {
  if (SUPPORT_DISCORD_GUILD_ID) {
    try {
      return await getDiscordGuildMemberProfile(SUPPORT_DISCORD_GUILD_ID, discordUserId);
    } catch {
      // fall back to global user profile when guild member lookup is unavailable
    }
  }
  return getDiscordUserProfile(discordUserId);
}

function mapDiscordAttachments(attachments: Array<{
  filename: string;
  content_type?: string | null;
  url?: string;
  size?: number;
  width?: number | null;
  height?: number | null;
}> | undefined): SupportAttachmentPayload[] {
  return (attachments ?? [])
    .filter((attachment) => !!attachment.url)
    .map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.content_type ?? null,
      url: attachment.url as string,
      size: attachment.size ?? null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    }));
}

function mapDiscordEmbeds(embeds: Array<{
  type?: string;
  url?: string;
  title?: string;
  description?: string;
  thumbnail?: { url?: string };
  image?: { url?: string };
  provider?: { name?: string };
}> | undefined): SupportEmbedPayload[] {
  return (embeds ?? []).map((embed) => ({
    type: embed.type ?? null,
    url: embed.url ?? null,
    title: embed.title ?? null,
    description: embed.description ?? null,
    imageUrl: embed.image?.url ?? null,
    thumbnailUrl: embed.thumbnail?.url ?? null,
    providerName: embed.provider?.name ?? null,
  }));
}

function buildAuthorMetadata(profile: DiscordProfile): SupportMessageMetadata['author'] {
  return {
    discordUserId: profile.discordUserId,
    displayName: profile.displayName,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
  };
}

async function serializeSupportThread(thread: SupportThreadWithMessages) {
  const [ownerProfile, customerProfile] = await Promise.all([
    getSupportProfile(thread.ownerDiscordUserId),
    getSupportProfile(thread.discordUserId),
  ]);

  return {
    id: thread.id,
    clerkUserId: thread.clerkUserId,
    discordUserId: thread.discordUserId,
    ownerDiscordUserId: thread.ownerDiscordUserId,
    discordChannelId: thread.discordChannelId,
    title: thread.title,
    status: thread.status,
    blockedAt: thread.blockedAt,
    blockedReason: thread.blockedReason,
    contextSummary: thread.contextSummary,
    contextJson: thread.contextJson,
    lastDiscordMessageId: thread.lastDiscordMessageId,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    ownerProfile,
    customerProfile,
    messages: thread.messages,
  };
}

async function getSupportAccessState(clerkUserId: string, discordUserId: string, isOwner: boolean) {
  if (isOwner || !SUPPORT_DISCORD_GUILD_ID) {
    return {
      canSendMessages: true,
      requiresDiscordJoin: false,
      requiresTermsAcceptance: false,
      requiresPrivacyAcceptance: false,
      joinDiscordUrl: SUPPORT_DISCORD_INVITE_URL,
      termsAcceptedAt: null,
      privacyAcceptedAt: null,
    };
  }

  const inGuild = await isDiscordGuildMember(SUPPORT_DISCORD_GUILD_ID, discordUserId);
  const onboarding = await getOnboardingStatus(clerkUserId, discordUserId);
  return {
    canSendMessages: onboarding.canAccessSupport,
    requiresDiscordJoin: !inGuild,
    requiresTermsAcceptance: inGuild && !onboarding.termsAcceptedAt,
    requiresPrivacyAcceptance: inGuild && !onboarding.privacyAcceptedAt,
    joinDiscordUrl: SUPPORT_DISCORD_INVITE_URL,
    termsAcceptedAt: onboarding.termsAcceptedAt,
    privacyAcceptedAt: onboarding.privacyAcceptedAt,
  };
}

function supportJoinRequiredResponse(c: any) {
  return c.json({
    error: 'Join the Hayashi Discord server before sending support messages.',
    reason: 'discord_join_required',
    joinDiscordUrl: SUPPORT_DISCORD_INVITE_URL,
  }, 403);
}

function supportPolicyRequiredResponse(c: any, policy: 'terms' | 'privacy') {
  return c.json({
    error: policy === 'terms'
      ? 'Accept the Terms of Service before sending support messages.'
      : 'Accept the Privacy Policy before sending support messages.',
    reason: policy === 'terms' ? 'terms_required' : 'privacy_required',
  }, 403);
}

async function parseSupportRequestBody(c: any): Promise<{
  accessToken?: string;
  userId?: string;
  title?: string;
  message?: string;
  content?: string;
  files: File[];
}> {
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const files = form.getAll('files').filter((value: FormDataEntryValue): value is File => value instanceof File);
    return {
      accessToken: typeof form.get('accessToken') === 'string' ? form.get('accessToken') as string : undefined,
      userId: typeof form.get('userId') === 'string' ? form.get('userId') as string : undefined,
      title: typeof form.get('title') === 'string' ? form.get('title') as string : undefined,
      message: typeof form.get('message') === 'string' ? form.get('message') as string : undefined,
      content: typeof form.get('content') === 'string' ? form.get('content') as string : undefined,
      files,
    };
  }

  const body = await c.req.json().catch(() => ({} as any));
  return {
    accessToken: body.accessToken,
    userId: body.userId,
    title: body.title,
    message: body.message,
    content: body.content,
    files: [],
  };
}

async function syncDiscordSupportReplies(thread: SupportThreadWithMessages): Promise<SupportThreadWithMessages> {
  if (!thread.discordChannelId) return thread;

  try {
    const remoteMessages = await listDiscordMessages(thread.discordChannelId, 50);
    const ownerReplies = remoteMessages
      .filter((message) => message.author?.id === thread.ownerDiscordUserId && (message.content.trim() || (message.attachments?.length ?? 0) > 0 || (message.embeds?.length ?? 0) > 0))
      .sort((a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime());

    let imported = false;
    for (const message of ownerReplies) {
      if (await hasSupportMessageByDiscordMessageId(message.id)) continue;
      const authorProfile = await getSupportProfile(thread.ownerDiscordUserId);
      await addSupportMessage({
        id: `support-msg-${message.id}`,
        threadId: thread.id,
        authorRole: 'support',
        content: message.content,
        source: 'discord',
        discordMessageId: message.id,
        metadataJson: {
          author: buildAuthorMetadata(authorProfile),
          attachments: mapDiscordAttachments(message.attachments),
          embeds: mapDiscordEmbeds(message.embeds),
        } satisfies SupportMessageMetadata,
        createdAt: message.timestamp ? new Date(message.timestamp).getTime() : Date.now(),
      });
      imported = true;
    }

    if (ownerReplies.length > 0) {
      await updateSupportThread({
        id: thread.id,
        lastDiscordMessageId: ownerReplies[ownerReplies.length - 1]?.id ?? thread.lastDiscordMessageId,
      });
    }

    const latestThread = await getSupportThread(thread.id);
    if (latestThread && imported) {
      await refreshSupportContext(latestThread);
      return (await getSupportThread(thread.id)) ?? latestThread;
    }

    return latestThread ?? thread;
  } catch (err) {
    console.warn('[Hayashi] Discord support sync failed:', err instanceof Error ? err.message : String(err));
    return thread;
  }
}

import { handleStripeWebhook } from './billing/stripeWebhook.js';

async function resolveStripePriceId(
  stripeClient: Stripe,
  configuredIdentifier: string,
  plan: 'creator' | 'pro' | 'studio',
): Promise<string> {
  if (configuredIdentifier.startsWith('price_')) return configuredIdentifier;

  if (configuredIdentifier.startsWith('prod_')) {
    const product = await stripeClient.products.retrieve(configuredIdentifier, { expand: ['default_price'] });
    const defaultPrice = typeof product.default_price === 'string'
      ? product.default_price
      : product.default_price?.id ?? null;
    if (defaultPrice) return defaultPrice;

    const prices = await stripeClient.prices.list({
      product: configuredIdentifier,
      active: true,
      limit: 1,
    });
    const fallbackPrice = prices.data[0]?.id ?? null;
    if (fallbackPrice) return fallbackPrice;
  }

  throw new Error(`Stripe price configuration for ${plan} is invalid: expected a price_ or prod_ identifier, received "${configuredIdentifier}"`);
}

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
    const checkoutPriceId = await resolveStripePriceId(stripeClient, priceId, plan);
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
      line_items: [{ price: checkoutPriceId, quantity: 1 }],
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

app.get('/api/onboarding/status', async (c) => {
  const accessToken = c.req.query('accessToken');
  const requestedDiscordUserId = c.req.query('userId');
  const resolved = await resolveSupportIdentity(c, accessToken, requestedDiscordUserId);
  if ('error' in resolved) return resolved.error;

  await billing.getOrCreateUser(resolved.identity);
  const status = await getOnboardingStatus(resolved.identity.userId, resolved.discord.providerUserId);

  return c.json({
    clerkUserId: resolved.identity.userId,
    discordUsername: resolved.discord.username,
    joinDiscordUrl: SUPPORT_DISCORD_INVITE_URL,
    supportGuildId: SUPPORT_DISCORD_GUILD_ID || null,
    joinedRoleId: SUPPORT_JOINED_ROLE_ID || null,
    termsRoleId: SUPPORT_TERMS_ROLE_ID || null,
    privacyRoleId: SUPPORT_PRIVACY_ROLE_ID || null,
    verifiedRoleId: SUPPORT_VERIFIED_ROLE_ID || null,
    ...status,
  });
});

app.post('/api/onboarding/accept', async (c) => {
  const body = await c.req.json<{ accessToken?: string; userId?: string; policy?: 'terms' | 'privacy' }>().catch(() => ({} as any));
  const resolved = await resolveSupportIdentity(c, body.accessToken, body.userId);
  if ('error' in resolved) return resolved.error;
  if (body.policy !== 'terms' && body.policy !== 'privacy') {
    return c.json({ error: 'Invalid policy' }, 400);
  }

  await billing.getOrCreateUser(resolved.identity);
  const status = await acceptOnboardingPolicy(resolved.identity.userId, resolved.discord.providerUserId, body.policy);

  return c.json({
    clerkUserId: resolved.identity.userId,
    discordUsername: resolved.discord.username,
    joinDiscordUrl: SUPPORT_DISCORD_INVITE_URL,
    supportGuildId: SUPPORT_DISCORD_GUILD_ID || null,
    joinedRoleId: SUPPORT_JOINED_ROLE_ID || null,
    termsRoleId: SUPPORT_TERMS_ROLE_ID || null,
    privacyRoleId: SUPPORT_PRIVACY_ROLE_ID || null,
    verifiedRoleId: SUPPORT_VERIFIED_ROLE_ID || null,
    ...status,
  });
});

app.get('/api/support/session', async (c) => {
  const accessToken = c.req.query('accessToken');
  const requestedDiscordUserId = c.req.query('userId');
  const resolved = await resolveSupportIdentity(c, accessToken, requestedDiscordUserId);
  if ('error' in resolved) return resolved.error;
  await billing.getOrCreateUser(resolved.identity);

  const threads = resolved.isOwner
    ? await listSupportThreadsForOwner(resolved.discord.providerUserId)
    : await listSupportThreadsForUser(resolved.identity.userId);
  const access = await getSupportAccessState(resolved.identity.userId, resolved.discord.providerUserId, resolved.isOwner);
  const ownerProfile = await getSupportProfile(SUPPORT_OWNER_DISCORD_USER_ID);

  return c.json({
    clerkUserId: resolved.identity.userId,
    discordUserId: resolved.discord.providerUserId,
    discordUsername: resolved.discord.username,
    isOwner: resolved.isOwner,
    ownerDiscordUserId: SUPPORT_OWNER_DISCORD_USER_ID,
    canSendMessages: access.canSendMessages,
    requiresDiscordJoin: access.requiresDiscordJoin,
    requiresTermsAcceptance: access.requiresTermsAcceptance,
    requiresPrivacyAcceptance: access.requiresPrivacyAcceptance,
    joinDiscordUrl: access.joinDiscordUrl,
    termsAcceptedAt: access.termsAcceptedAt,
    privacyAcceptedAt: access.privacyAcceptedAt,
    ownerProfile,
    threads,
  });
});

app.post('/api/support/threads', async (c) => {
  const body = await parseSupportRequestBody(c);
  const resolved = await resolveSupportIdentity(c, body.accessToken, body.userId);
  if ('error' in resolved) return resolved.error;

  if (!resolved.isOwner) {
    const existingThreads = await listSupportThreadsForUser(resolved.identity.userId);
    if (existingThreads.some((thread) => !!thread.blockedAt)) {
      return c.json({ error: 'Support access has been blocked for this account' }, 403);
    }
  }
  await billing.getOrCreateUser(resolved.identity);
  const access = await getSupportAccessState(resolved.identity.userId, resolved.discord.providerUserId, resolved.isOwner);
  if (!access.canSendMessages) {
    if (access.requiresDiscordJoin) return supportJoinRequiredResponse(c);
    if (access.requiresTermsAcceptance) return supportPolicyRequiredResponse(c, 'terms');
    if (access.requiresPrivacyAcceptance) return supportPolicyRequiredResponse(c, 'privacy');
  }

  const threadId = `support-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const ownerProfile = await getSupportProfile(SUPPORT_OWNER_DISCORD_USER_ID);
  const customerProfile = await getSupportProfile(resolved.discord.providerUserId);
  const messageContent = body.message?.trim() ?? '';
  const title = (ownerProfile.displayName || body.title?.trim() || messageContent.slice(0, 56) || 'Support request').slice(0, 80);

  try {
    const channelId = await createDmChannel(SUPPORT_OWNER_DISCORD_USER_ID);
    await createSupportThread({
      id: threadId,
      clerkUserId: resolved.identity.userId,
      discordUserId: resolved.discord.providerUserId,
      ownerDiscordUserId: SUPPORT_OWNER_DISCORD_USER_ID,
      title,
      discordChannelId: channelId,
    });

    if (messageContent || body.files.length) {
      const outbound = await sendDiscordMessage(
        channelId,
        `New support thread ${threadId}\nCustomer Discord ID: ${resolved.discord.providerUserId}${messageContent ? `\n\n${messageContent}` : ''}`,
        await Promise.all(body.files.map(async (file) => ({
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          bytes: new Uint8Array(await file.arrayBuffer()),
        })))
      );
      await addSupportMessage({
        id: `support-web-${Date.now()}`,
        threadId,
        authorRole: resolved.isOwner ? 'support' : 'customer',
        content: messageContent,
        source: 'web',
        discordMessageId: outbound.id,
        metadataJson: {
          author: buildAuthorMetadata(customerProfile),
          attachments: mapDiscordAttachments(outbound.attachments),
          embeds: mapDiscordEmbeds(outbound.embeds),
        } satisfies SupportMessageMetadata,
      });
    }
  } catch (error) {
    if (isDiscordMutualGuildError(error)) return supportJoinRequiredResponse(c);
    throw error;
  }

  const thread = await getSupportThread(threadId);
  if (!thread) return c.json({ error: 'Failed to create support thread' }, 500);
  await refreshSupportContext(thread);
  const latest = await getSupportThread(threadId);
  return c.json(await serializeSupportThread(latest ?? thread));
});

app.get('/api/support/threads/:id', async (c) => {
  const resolved = await resolveSupportIdentity(c, c.req.query('accessToken'), c.req.query('userId'));
  if ('error' in resolved) return resolved.error;

  const thread = await getSupportThread(c.req.param('id'));
  if (!thread) return c.json({ error: 'Thread not found' }, 404);
  if (!resolved.isOwner && thread.clerkUserId !== resolved.identity.userId) return c.json({ error: 'Forbidden' }, 403);

  const synced = await syncDiscordSupportReplies(thread);
  return c.json(await serializeSupportThread(synced));
});

app.post('/api/support/threads/:id/messages', async (c) => {
  const body = await parseSupportRequestBody(c);
  const resolved = await resolveSupportIdentity(c, body.accessToken, body.userId);
  if ('error' in resolved) return resolved.error;
  const messageContent = body.content?.trim() ?? '';
  if (!messageContent && body.files.length === 0) return c.json({ error: 'Missing content' }, 400);

  const thread = await getSupportThread(c.req.param('id'));
  if (!thread) return c.json({ error: 'Thread not found' }, 404);
  if (!resolved.isOwner && thread.clerkUserId !== resolved.identity.userId) return c.json({ error: 'Forbidden' }, 403);
  if (!resolved.isOwner && thread.blockedAt) return c.json({ error: 'You have been blocked from this thread' }, 403);
  await billing.getOrCreateUser(resolved.identity);
  const access = await getSupportAccessState(resolved.identity.userId, resolved.discord.providerUserId, resolved.isOwner);
  if (!access.canSendMessages) {
    if (access.requiresDiscordJoin) return supportJoinRequiredResponse(c);
    if (access.requiresTermsAcceptance) return supportPolicyRequiredResponse(c, 'terms');
    if (access.requiresPrivacyAcceptance) return supportPolicyRequiredResponse(c, 'privacy');
  }

  const authorRole = resolved.isOwner ? 'support' : 'customer';
  const authorProfile = await getSupportProfile(resolved.isOwner ? SUPPORT_OWNER_DISCORD_USER_ID : resolved.discord.providerUserId);
  let outbound: Awaited<ReturnType<typeof sendDiscordMessage>> | null = null;
  try {
    const channelId = thread.discordChannelId ?? await createDmChannel(SUPPORT_OWNER_DISCORD_USER_ID);
    if (!thread.discordChannelId) {
      await updateSupportThread({ id: thread.id, discordChannelId: channelId });
    }

    const outboundText = resolved.isOwner
      ? `Support reply on ${thread.id}${messageContent ? `\n\n${messageContent}` : ''}`
      : `Customer reply on ${thread.id}\nCustomer Discord ID: ${thread.discordUserId}${messageContent ? `\n\n${messageContent}` : ''}`;
    outbound = await sendDiscordMessage(channelId, outboundText, await Promise.all(body.files.map(async (file) => ({
      name: file.name,
      contentType: file.type || 'application/octet-stream',
      bytes: new Uint8Array(await file.arrayBuffer()),
    }))));
  } catch (error) {
    if (isDiscordMutualGuildError(error)) return supportJoinRequiredResponse(c);
    throw error;
  }

  await addSupportMessage({
    id: `support-web-${Date.now()}-${randomUUID().slice(0, 6)}`,
    threadId: thread.id,
    authorRole,
    content: messageContent,
    source: 'web',
    discordMessageId: outbound?.id ?? null,
    metadataJson: {
      author: buildAuthorMetadata(authorProfile),
      attachments: mapDiscordAttachments(outbound?.attachments),
      embeds: mapDiscordEmbeds(outbound?.embeds),
    } satisfies SupportMessageMetadata,
  });

  const latestThread = await getSupportThread(thread.id);
  if (!latestThread) return c.json({ error: 'Thread not found after send' }, 500);
  await refreshSupportContext(latestThread);
  const refreshed = await getSupportThread(thread.id);
  return c.json(await serializeSupportThread(refreshed ?? latestThread));
});

app.post('/api/support/threads/:id/block', async (c) => {
  const body = await c.req.json<{ accessToken?: string; reason?: string }>().catch(() => ({} as any));
  const resolved = await resolveSupportIdentity(c, body.accessToken);
  if ('error' in resolved) return resolved.error;
  if (!resolved.isOwner) return c.json({ error: 'Forbidden' }, 403);

  const thread = await getSupportThread(c.req.param('id'));
  if (!thread) return c.json({ error: 'Thread not found' }, 404);

  const now = Date.now();
  await updateSupportThread({
    id: thread.id,
    status: 'blocked',
    blockedAt: now,
    blockedReason: body.reason?.trim() || 'Rude or confrontational behavior',
  });
  await addSupportMessage({
    id: `support-system-${now}`,
    threadId: thread.id,
    authorRole: 'system',
    content: `Thread blocked: ${body.reason?.trim() || 'Rude or confrontational behavior'}`,
    source: 'system',
    createdAt: now,
  });

  const latestThread = await getSupportThread(thread.id);
  if (!latestThread) return c.json({ error: 'Thread not found after block' }, 500);
  return c.json(await serializeSupportThread(latestThread));
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

  // Always create the plugin row immediately so the client can poll for it
  await createPlugin({ id: pluginId, ownerId: identity.userId, name, type, generationStatus: 'generating', generationError: null });

  // If Temporal Cloud is configured, fire-and-forget the generation workflow.
  const temporalConfigured = !!(process.env.TEMPORAL_NAMESPACE && process.env.TEMPORAL_API_KEY);
  if (temporalConfigured) {
    try {
      const temporal = await getTemporalClient();
      await temporal.workflow.start('generatePluginWorkflow', {
        taskQueue: 'hayashi-plugin-generation',
        workflowId: `generate-plugin-${pluginId}`,
        args: [{ pluginId, ownerId: identity.userId, name, type, prompt: body.prompt }],
      });
      return c.json({ pluginId, status: 'generating', type, name });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start generation workflow';
      console.error('[Hayashi] Temporal workflow start failed:', message);
      // Fall through to inline generation so the user isn't stranded.
    }
  }

  // Inline fallback when Temporal is not configured or workflow start failed.
  try {
    const generated = await generateFaustFromPrompt(body.prompt);
    const params = parseFaustParams(generated.faustCode);

    const versionId = `${pluginId}-v1`;
    const artifactManifest = await persistGeneratedArtifacts(pluginId, versionId, generated);
    await addVersion({
      id: versionId,
      pluginId,
      versionNumber: 1,
      prompt: body.prompt,
      faustCode: generated.faustCode,
      paramsJson: paramsToJson(params),
      specJson: generated.spec,
      templateId: generated.templateId,
      toneModel: generated.toneModel,
      qualityProfile: generated.qualityProfile,
      stereoProfile: generated.stereoProfile,
      macroJson: generated.macroJson,
      uiSpecJson: generated.uiSpecJson,
      evalMetricsJson: generated.evalMetricsJson,
      qualityLabelsJson: [],
      compileErrorsJson: generated.compileErrorsJson,
      artifactManifestJson: artifactManifest,
    });

    await addMessage({ id: `msg-${Date.now()}-user`, pluginId, role: 'user', content: body.prompt });
    await addMessage({ id: `msg-${Date.now()}-assistant`, pluginId, role: 'assistant', content: generated.faustCode, versionId });

    const evalMetrics = generated.evalMetricsJson && typeof generated.evalMetricsJson === 'object'
      ? generated.evalMetricsJson as Record<string, unknown>
      : null;
    const candidateLineage = evalMetrics?.candidateLineage && typeof evalMetrics.candidateLineage === 'object'
      ? evalMetrics.candidateLineage as Record<string, unknown>
      : null;
    logGenerationEvent({
      timestamp: Date.now(),
      event: 'generation_succeeded',
      pluginId,
      versionId,
      ownerId: identity.userId,
      pluginType: type,
      prompt: body.prompt,
      templateId: generated.templateId,
      toneModel: generated.toneModel,
      qualityProfile: generated.qualityProfile,
      stereoProfile: generated.stereoProfile,
      candidateCount: typeof candidateLineage?.candidateCount === 'number' ? candidateLineage.candidateCount : undefined,
      selectedCandidateId: typeof candidateLineage?.selectedCandidateId === 'string' ? candidateLineage.selectedCandidateId : null,
      compileErrorCount: Array.isArray(generated.compileErrorsJson) ? generated.compileErrorsJson.length : 0,
      failedChecks: Array.isArray(evalMetrics?.checks) ? evalMetrics.checks.filter((check) => check && typeof check === 'object' && (check as Record<string, unknown>).passed === false).length : 0,
      overallScore: evalMetrics?.metrics && typeof evalMetrics.metrics === 'object' && typeof (evalMetrics.metrics as Record<string, unknown>).overallScore === 'number'
        ? (evalMetrics.metrics as Record<string, unknown>).overallScore as number
        : null,
    });

    return c.json({ pluginId, versionId, faustCode: generated.faustCode, params, type, name, spec: generated.spec, uiSpec: generated.uiSpecJson });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    console.error('[Hayashi] Plugin creation failed:', message);
    await updatePluginGenerationState({ pluginId, generationStatus: 'failed', generationError: message });
    logGenerationEvent({
      timestamp: Date.now(),
      event: 'generation_failed',
      pluginId,
      ownerId: identity.userId,
      pluginType: type,
      prompt: body.prompt,
      error: message,
    });
    return c.json({ error: message }, 500);
  }
});

app.post('/api/smoke/parametric-eq/export', async (c) => {
  const body = await c.req.json<{
    accessToken?: string;
    prompt?: string;
    format?: string;
    pluginName?: string;
  }>().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const prompt = body.prompt?.trim();
  if (!prompt) return c.json({ error: 'Missing prompt' }, 400);

  const format = normalizeBuildFormat(body.format ?? 'vst3');
  if (!format) return c.json({ error: 'Invalid format' }, 400);

  try {
    const authorization = await authorizeSmokeExport(identity);
    if (!authorization.allowed) {
      return c.json({
        error: authorization.snapshot.contextAccess.message,
        reason: authorization.snapshot.contextAccess.reason,
      }, 403);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing check failed';
    console.error('[Hayashi] Smoke export billing check failed:', message);
    return c.json({ error: 'Billing check failed' }, 500);
  }

  try {
    const optimized = await runParametricEqOptimizationPass(prompt);
    const pluginName = (body.pluginName ?? optimized.artifacts.spec.name ?? 'HayashiSmokeEq')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const result = await queueSmokeExportBuild({
      ownerId: identity.userId,
      prompt,
      format,
      pluginName,
      pluginType: 'effect',
      optimizationCategory: 'parametric_eq',
      optimized,
    });
    return c.json(result, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Smoke export failed';
    console.error('[Hayashi] Smoke export failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/api/smoke/synth/export', async (c) => {
  const body = await c.req.json<{
    accessToken?: string;
    prompt?: string;
    format?: string;
    pluginName?: string;
  }>().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const prompt = body.prompt?.trim();
  if (!prompt) return c.json({ error: 'Missing prompt' }, 400);

  const format = normalizeBuildFormat(body.format ?? 'vst3');
  if (!format) return c.json({ error: 'Invalid format' }, 400);

  try {
    const authorization = await authorizeSmokeExport(identity);
    if (!authorization.allowed) {
      return c.json({
        error: authorization.snapshot.contextAccess.message,
        reason: authorization.snapshot.contextAccess.reason,
      }, 403);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing check failed';
    console.error('[Hayashi] Smoke synth export billing check failed:', message);
    return c.json({ error: 'Billing check failed' }, 500);
  }

  try {
    const optimized = await runSynthOptimizationPass(prompt);
    const pluginName = (body.pluginName ?? optimized.artifacts.spec.name ?? 'HayashiSmokeSynth')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const result = await queueSmokeExportBuild({
      ownerId: identity.userId,
      prompt,
      format,
      pluginName,
      pluginType: 'synth',
      optimizationCategory: 'synth',
      optimized,
    });
    return c.json(result, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Smoke synth export failed';
    console.error('[Hayashi] Smoke synth export failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/api/smoke/reverb-space/export', async (c) => {
  const body = await c.req.json<{
    accessToken?: string;
    prompt?: string;
    format?: string;
    pluginName?: string;
  }>().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const prompt = body.prompt?.trim();
  if (!prompt) return c.json({ error: 'Missing prompt' }, 400);

  const format = normalizeBuildFormat(body.format ?? 'vst3');
  if (!format) return c.json({ error: 'Invalid format' }, 400);

  try {
    const authorization = await authorizeSmokeExport(identity);
    if (!authorization.allowed) {
      return c.json({
        error: authorization.snapshot.contextAccess.message,
        reason: authorization.snapshot.contextAccess.reason,
      }, 403);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing check failed';
    console.error('[Hayashi] Smoke reverb export billing check failed:', message);
    return c.json({ error: 'Billing check failed' }, 500);
  }

  try {
    const optimized = await runReverbSpaceOptimizationPass(prompt);
    const pluginName = (body.pluginName ?? optimized.artifacts.spec.name ?? 'HayashiSmokeReverb')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const result = await queueSmokeExportBuild({
      ownerId: identity.userId,
      prompt,
      format,
      pluginName,
      pluginType: 'effect',
      optimizationCategory: 'reverb_space',
      optimized,
    });
    return c.json(result, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Smoke reverb export failed';
    console.error('[Hayashi] Smoke reverb export failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/api/smoke/delay-echo/export', async (c) => {
  const body = await c.req.json<{
    accessToken?: string;
    prompt?: string;
    format?: string;
    pluginName?: string;
  }>().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const prompt = body.prompt?.trim();
  if (!prompt) return c.json({ error: 'Missing prompt' }, 400);

  const format = normalizeBuildFormat(body.format ?? 'vst3');
  if (!format) return c.json({ error: 'Invalid format' }, 400);

  try {
    const authorization = await authorizeSmokeExport(identity);
    if (!authorization.allowed) {
      return c.json({
        error: authorization.snapshot.contextAccess.message,
        reason: authorization.snapshot.contextAccess.reason,
      }, 403);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing check failed';
    console.error('[Hayashi] Smoke delay export billing check failed:', message);
    return c.json({ error: 'Billing check failed' }, 500);
  }

  try {
    const optimized = await runDelayEchoOptimizationPass(prompt);
    const pluginName = (body.pluginName ?? optimized.artifacts.spec.name ?? 'HayashiSmokeDelay')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const result = await queueSmokeExportBuild({
      ownerId: identity.userId,
      prompt,
      format,
      pluginName,
      pluginType: 'effect',
      optimizationCategory: 'delay_echo',
      optimized,
    });
    return c.json(result, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Smoke delay export failed';
    console.error('[Hayashi] Smoke delay export failed:', message);
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
  await updatePluginGenerationState({ pluginId, generationStatus: 'refining', generationError: null });

  const temporalConfigured = !!(process.env.TEMPORAL_NAMESPACE && process.env.TEMPORAL_API_KEY);
  if (temporalConfigured) {
    try {
      const temporal = await getTemporalClient();
      await temporal.workflow.start('iteratePluginWorkflow', {
        taskQueue: 'hayashi-plugin-generation',
        workflowId: `iterate-plugin-${pluginId}-v${nextVersionNumber}`,
        args: [{
          pluginId,
          ownerId: identity.userId,
          instruction: body.instruction,
          previousCode: latestVersion.faustCode,
          previousPrompts,
          type: thread.type as 'synth' | 'effect' | 'percussion',
          previousParams,
          nextVersionNumber,
        }],
      });
      return c.json({ pluginId, status: 'generating' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start iteration workflow';
      console.error('[Hayashi] Temporal iteration workflow start failed:', message);
      // Fall through to inline iteration so the user isn't stranded.
    }
  }

  // Inline fallback when Temporal is not configured or workflow start failed.
  try {
    const generated = await iterateFaustFromPrompt(
      body.instruction,
      latestVersion.faustCode,
      previousPrompts,
      thread.type as 'synth' | 'effect' | 'percussion',
      previousParams
    );

    const params = parseFaustParams(generated.faustCode);
    const versionId = `${pluginId}-v${nextVersionNumber}`;
    const artifactManifest = await persistGeneratedArtifacts(pluginId, versionId, generated);

    await addVersion({
      id: versionId,
      pluginId,
      versionNumber: nextVersionNumber,
      prompt: body.instruction,
      faustCode: generated.faustCode,
      paramsJson: paramsToJson(params),
      specJson: generated.spec,
      templateId: generated.templateId,
      toneModel: generated.toneModel,
      qualityProfile: generated.qualityProfile,
      stereoProfile: generated.stereoProfile,
      macroJson: generated.macroJson,
      uiSpecJson: generated.uiSpecJson,
      evalMetricsJson: generated.evalMetricsJson,
      qualityLabelsJson: [],
      compileErrorsJson: generated.compileErrorsJson,
      artifactManifestJson: artifactManifest,
    });

    await addMessage({ id: `msg-${Date.now()}-user`, pluginId, role: 'user', content: body.instruction });
    await addMessage({ id: `msg-${Date.now()}-assistant`, pluginId, role: 'assistant', content: generated.faustCode, versionId });

    const evalMetrics = generated.evalMetricsJson && typeof generated.evalMetricsJson === 'object'
      ? generated.evalMetricsJson as Record<string, unknown>
      : null;
    const candidateLineage = evalMetrics?.candidateLineage && typeof evalMetrics.candidateLineage === 'object'
      ? evalMetrics.candidateLineage as Record<string, unknown>
      : null;
    logGenerationEvent({
      timestamp: Date.now(),
      event: 'iteration_succeeded',
      pluginId,
      versionId,
      ownerId: identity.userId,
      pluginType: thread.type,
      prompt: body.instruction,
      templateId: generated.templateId,
      toneModel: generated.toneModel,
      qualityProfile: generated.qualityProfile,
      stereoProfile: generated.stereoProfile,
      candidateCount: typeof candidateLineage?.candidateCount === 'number' ? candidateLineage.candidateCount : undefined,
      selectedCandidateId: typeof candidateLineage?.selectedCandidateId === 'string' ? candidateLineage.selectedCandidateId : null,
      compileErrorCount: Array.isArray(generated.compileErrorsJson) ? generated.compileErrorsJson.length : 0,
      failedChecks: Array.isArray(evalMetrics?.checks) ? evalMetrics.checks.filter((check) => check && typeof check === 'object' && (check as Record<string, unknown>).passed === false).length : 0,
      overallScore: evalMetrics?.metrics && typeof evalMetrics.metrics === 'object' && typeof (evalMetrics.metrics as Record<string, unknown>).overallScore === 'number'
        ? (evalMetrics.metrics as Record<string, unknown>).overallScore as number
        : null,
    });

    return c.json({ pluginId, versionId, versionNumber: nextVersionNumber, faustCode: generated.faustCode, params, spec: generated.spec, uiSpec: generated.uiSpecJson });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Iteration failed';
    console.error('[Hayashi] Plugin iteration failed:', message);
    await updatePluginGenerationState({ pluginId, generationStatus: 'failed', generationError: message });
    logGenerationEvent({
      timestamp: Date.now(),
      event: 'iteration_failed',
      pluginId,
      ownerId: identity.userId,
      pluginType: thread.type,
      prompt: body.instruction,
      error: message,
    });
    return c.json({ error: message }, 500);
  }
});

app.post('/api/plugins/:id/versions/:versionId/labels', async (c) => {
  const pluginId = c.req.param('id');
  const versionId = c.req.param('versionId');
  const body = await c.req.json<{ accessToken?: string; labels?: string[] }>().catch(() => ({} as any));
  const identity = await verifyAuth(c, body.accessToken);
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const thread = await getPluginThread(pluginId);
  if (!thread) return c.json({ error: 'Plugin not found' }, 404);
  if (thread.ownerId !== identity.userId) return c.json({ error: 'Forbidden' }, 403);

  const version = thread.versions.find((item) => item.id === versionId);
  if (!version) return c.json({ error: 'Version not found' }, 404);

  const allowedLabels: QualityLabel[] = ['good', 'harsh', 'muddy', 'boring', 'too_wet', 'too_narrow', 'unstable'];
  const labels = Array.isArray(body.labels)
    ? body.labels.filter((label: string): label is QualityLabel => allowedLabels.includes(label as QualityLabel))
    : [];
  const uniqueLabels: QualityLabel[] = [...new Set<QualityLabel>(labels)];

  await setVersionQualityLabels(pluginId, versionId, uniqueLabels);
  return c.json({ pluginId, versionId, qualityLabels: uniqueLabels });
});

app.get('/api/plugins', async (c) => {
  const identity = await verifyAuth(c, c.req.query('accessToken'));
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const threads = await listPluginsForUser(identity.userId);
    return c.json(threads.map((thread) => serializePluginThread(thread)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list plugins';
    console.error('[Hayashi] Plugin list failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/api/plugins/dashboard', async (c) => {
  const identity = await verifyAuth(c, c.req.query('accessToken'));
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const threads = await listPluginsForUser(identity.userId);
    return c.json(buildGenerationDashboard(threads));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build dashboard';
    console.error('[Hayashi] Plugin dashboard failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/api/builds', async (c) => {
  const identity = await verifyAuth(c, c.req.query('accessToken'));
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const rows = await listBuildsForUser(identity.userId);
    return c.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list builds';
    console.error('[Hayashi] Build list failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/api/builds/:id/logs', async (c) => {
  const identity = await verifyAuth(c, c.req.query('accessToken'));
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const buildId = c.req.param('id');
  if (!buildId) return c.json({ error: 'Missing build id' }, 400);

  try {
    const build = await getBuild(buildId);
    if (!build) return c.json({ error: 'Build not found' }, 404);
    if (build.ownerId !== identity.userId) return c.json({ error: 'Forbidden' }, 403);

    const logs = await listBuildLogs(buildId, 400);
    return c.json(logs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list build logs';
    console.error('[Hayashi] Build logs failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.get('/api/internal/builds/:id/payload', async (c) => {
  if (!verifyBuildRunnerSecret(c.req.header('x-hayashi-build-secret'))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const buildId = c.req.param('id');
  if (!buildId) return c.json({ error: 'Missing build id' }, 400);

  try {
    const build = await getBuildExecutionPayload(buildId);
    if (!build) return c.json({ error: 'Build not found' }, 404);
    return c.json(build);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load build payload';
    console.error('[Hayashi] Internal build payload failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/api/internal/builds/:id/progress', async (c) => {
  if (!verifyBuildRunnerSecret(c.req.header('x-hayashi-build-secret'))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const buildId = c.req.param('id');
  const body = await c.req.json<{
    stage?: string;
    statusMessage?: string | null;
    log?: {
      level?: 'info' | 'warn' | 'error';
      message?: string;
      source?: string | null;
    };
  }>().catch(() => ({} as any));

  if (!buildId) return c.json({ error: 'Missing build id' }, 400);
  const build = await getBuild(buildId);
  if (!build) return c.json({ error: 'Build not found' }, 404);

  const nextStage = body.stage && body.stage in {
    queued: true,
    preparing: true,
    dispatching: true,
    building_dpf: true,
    building_ui: true,
    packaging: true,
    uploading: true,
    completed: true,
    failed: true,
  } ? body.stage as any : build.stage;

  try {
    await updateBuild({
      id: buildId,
      status: nextStage === 'completed' ? 'completed' : nextStage === 'failed' ? 'failed' : 'running',
      stage: nextStage,
      statusMessage: body.statusMessage ?? build.statusMessage,
      startedAt: build.startedAt ?? Date.now(),
      completedAt: nextStage === 'completed' || nextStage === 'failed' ? Date.now() : build.completedAt,
      errorMessage: nextStage === 'failed' ? (body.statusMessage ?? build.errorMessage ?? 'Build failed') : build.errorMessage,
    });

    if (body.log?.message) {
      await appendBuildLog({
        id: `log-${Date.now()}-${randomUUID().slice(0, 8)}`,
        buildId,
        level: body.log.level ?? 'info',
        stage: nextStage,
        source: body.log.source ?? 'github-runner',
        message: body.log.message,
        createdAt: Date.now(),
      });
    }

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update build progress';
    console.error('[Hayashi] Internal build progress failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/api/internal/builds/:id/complete', async (c) => {
  if (!verifyBuildRunnerSecret(c.req.header('x-hayashi-build-secret'))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const buildId = c.req.param('id');
  const body = await c.req.json<{
    filename?: string | null;
    downloadUrl?: string | null;
    statusMessage?: string | null;
  }>().catch(() => ({} as any));

  if (!buildId) return c.json({ error: 'Missing build id' }, 400);
  const build = await getBuild(buildId);
  if (!build) return c.json({ error: 'Build not found' }, 404);
  if (!body.downloadUrl || !body.filename) {
    return c.json({ error: 'Missing build artifact details' }, 400);
  }

  try {
    await updateBuild({
      id: buildId,
      status: 'completed',
      stage: 'completed',
      statusMessage: body.statusMessage ?? `Completed ${labelForTarget(build.target)} build`,
      filename: body.filename,
      downloadUrl: body.downloadUrl,
      startedAt: build.startedAt ?? Date.now(),
      completedAt: Date.now(),
      errorMessage: null,
    });
    await appendBuildLog({
      id: `log-${Date.now()}-${randomUUID().slice(0, 8)}`,
      buildId,
      level: 'info',
      stage: 'completed',
      source: 'github-runner',
      message: body.statusMessage ?? 'Remote builder uploaded artifact successfully',
      createdAt: Date.now(),
    });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark build complete';
    console.error('[Hayashi] Internal build complete failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/api/internal/builds/:id/fail', async (c) => {
  if (!verifyBuildRunnerSecret(c.req.header('x-hayashi-build-secret'))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const buildId = c.req.param('id');
  const body = await c.req.json<{
    errorMessage?: string | null;
    statusMessage?: string | null;
  }>().catch(() => ({} as any));

  if (!buildId) return c.json({ error: 'Missing build id' }, 400);
  const build = await getBuild(buildId);
  if (!build) return c.json({ error: 'Build not found' }, 404);

  const errorMessage = body.errorMessage?.trim() || body.statusMessage?.trim() || 'Remote build failed';
  try {
    await updateBuild({
      id: buildId,
      status: 'failed',
      stage: 'failed',
      statusMessage: body.statusMessage ?? 'Build failed',
      errorMessage,
      startedAt: build.startedAt ?? Date.now(),
      completedAt: Date.now(),
    });
    await appendBuildLog({
      id: `log-${Date.now()}-${randomUUID().slice(0, 8)}`,
      buildId,
      level: 'error',
      stage: 'failed',
      source: 'github-runner',
      message: errorMessage,
      createdAt: Date.now(),
    });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark build failed';
    console.error('[Hayashi] Internal build fail failed:', message);
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

  return c.json(serializePluginThread(thread));
});

app.get('/api/share/:id', async (c) => {
  const pluginId = c.req.param('id');
  const thread = await getPluginThread(pluginId);
  if (!thread) return c.json({ error: 'Plugin not found' }, 404);

  const owner = await getClerkPublicProfile(thread.ownerId);
  const serialized = serializePluginThread(thread);
  if (!serialized) return c.json({ error: 'Plugin not found' }, 404);

  return c.json({
    plugin: serialized,
    owner: {
      userId: owner?.userId ?? thread.ownerId,
      name: owner?.name ?? 'A Hayashi creator',
      imageUrl: owner?.imageUrl ?? null,
    },
  });
});

app.get('/api/training-corpus', async (c) => {
  const identity = await verifyAuth(c, c.req.query('accessToken'));
  if (!identity) return c.json({ error: 'Unauthorized' }, 401);

  const format = c.req.query('format') === 'ndjson' ? 'ndjson' : 'json';

  try {
    const threads = await listPluginsForUser(identity.userId);
    const corpus = buildTrainingCorpus(threads);

    if (format === 'ndjson') {
      const body = corpus.map((record) => JSON.stringify(record)).join('\n');
      return c.body(body, 200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
    }

    return c.json({
      schemaVersion: '1.0',
      exportedAt: Date.now(),
      recordCount: corpus.length,
      records: corpus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export training corpus';
    console.error('[Hayashi] Training corpus export failed:', message);
    return c.json({ error: message }, 500);
  }
});

app.post('/api/generate-faust', async (c) => {
  const body = await c.req.json<{ prompt?: string }>().catch(() => ({} as any));
  const prompt = body.prompt;
  if (!prompt || typeof prompt !== 'string') {
    return c.json({ error: 'prompt required' }, 400);
  }
  try {
    const generated = await generateFaustFromPrompt(prompt);
    return c.json({ faustCode: generated.faustCode, prompt, spec: generated.spec });
  } catch (err) {
    console.error('[FaustGen]', err);
    return c.json({ error: 'generation failed' }, 500);
  }
});

app.post('/api/export/:format', async (c) => {
  const format = normalizeBuildFormat(c.req.param('format'));
  if (!format) {
    return c.json({ error: 'Unsupported format. Use vst3 or clap.' }, 400);
  }

  const body = await c.req.json<{ accessToken?: string; pluginName?: string; pluginId?: string; version?: string; versionId?: string; faustCode?: string; target?: string }>().catch(() => ({} as any));
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
  const target = normalizeBuildTarget(body.target) ?? defaultTargetForFormat(format);
  if (formatForTarget(target) !== format) {
    return c.json({ error: `Target ${target} does not match export format ${format}` }, 400);
  }
  const thread = await getPluginThread(safePluginId);
  if (!thread) return c.json({ error: 'Plugin not found' }, 404);
  if (thread.ownerId !== identity.userId) return c.json({ error: 'Forbidden' }, 403);

  try {
    const user = await billing.getOrCreateUser(identity);
    const snapshot = await billing.authorizeExport(user);
    if (!snapshot.contextAccess.allowed) {
      return c.json({ error: snapshot.contextAccess.message, reason: snapshot.contextAccess.reason }, 403);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing check failed';
    console.error('[Hayashi] Export billing check failed:', message, { pluginId: safePluginId, format, target });
    return c.json({ error: 'Billing check failed' }, 500);
  }

  const pluginName = (body.pluginName ?? 'HayashiPlugin').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const requestedVersionId = body.versionId?.trim() || null;
  const requestedVersionNumber = parseInt(version.replace(/\D/g, ''), 10) || 1;
  const versionRecord = requestedVersionId
    ? thread.versions.find((item) => item.id === requestedVersionId) ?? null
    : await getPluginVersion(safePluginId, requestedVersionNumber);
  if (!versionRecord) return c.json({ error: 'Version not found' }, 404);

  const activeBuild = await findActiveBuildForVersion(identity.userId, safePluginId, versionRecord.id, target);
  if (activeBuild) {
    const existing = await getBuild(activeBuild.id);
    return c.json(existing ?? activeBuild, 202);
  }

  const buildId = `build-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workflowId = `export-build-${buildId}`;
  try {
    await createBuild({
      id: buildId,
      pluginId: safePluginId,
      versionId: versionRecord.id,
      ownerId: identity.userId,
      format,
      target,
      workflowId,
      status: 'queued',
      stage: 'queued',
      statusMessage: `Queued ${labelForTarget(target)} build for ${pluginName}`,
      metadataJson: {
        requestedPluginName: pluginName,
        requestedVersion: version,
        requestedTarget: target,
      },
    });

    const temporalConfigured = !!(process.env.TEMPORAL_NAMESPACE && process.env.TEMPORAL_API_KEY);
    if (temporalConfigured) {
      try {
        const temporal = await getTemporalClient();
        await temporal.workflow.start('exportBuildWorkflow', {
          taskQueue: 'hayashi-plugin-generation',
          workflowId,
          args: [{ buildId }],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start export workflow';
        console.error('[Hayashi] Temporal export workflow start failed:', message);
        const { exportBuildActivity } = await import('./temporal/activities.js');
        void exportBuildActivity({ buildId }).catch((activityErr) => {
          const activityMessage = activityErr instanceof Error ? activityErr.message : 'Background export failed';
          console.error('[Hayashi] Inline export activity failed:', activityMessage);
        });
      }
    } else {
      const { exportBuildActivity } = await import('./temporal/activities.js');
      void exportBuildActivity({ buildId }).catch((activityErr) => {
        const activityMessage = activityErr instanceof Error ? activityErr.message : 'Background export failed';
        console.error('[Hayashi] Inline export activity failed:', activityMessage);
      });
    }

    const created = await getBuild(buildId);
    return c.json(created, 202);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Compilation failed';
    console.error('[Hayashi] Export build enqueue failed:', message, { pluginId: safePluginId, pluginName, format, target });
    return c.json({ error: message }, 500);
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
