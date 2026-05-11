import { createHmac, timingSafeEqual } from 'crypto';
import { HAYASHI_UNLIMITED_PRICE_ID, normalizeSubscriptionStatus } from './service.js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

function requireStripeSecret(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe is not configured on the server');
  return key;
}

async function stripeFormRequest<T>(path: string, params: URLSearchParams): Promise<T> {
  const secret = requireStripeSecret();
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: { message?: string } }).error?.message ?? 'Stripe request failed');
  }
  return body as T;
}

export async function createStripeCustomer(input: {
  discordUserId: string;
  username: string;
  email: string | null;
}) {
  const params = new URLSearchParams();
  params.set('name', input.username);
  if (input.email) params.set('email', input.email);
  params.set('metadata[discord_user_id]', input.discordUserId);
  return stripeFormRequest<{ id: string }>('/customers', params);
}

export async function updateStripeCustomerEmail(input: {
  customerId: string;
  email: string;
  username?: string | null;
}) {
  const params = new URLSearchParams();
  params.set('email', input.email);
  if (input.username) params.set('name', input.username);
  return stripeFormRequest<{ id: string; email: string | null }>('/customers/' + input.customerId, params);
}

export async function createCheckoutSession(input: {
  customerId: string;
  discordUserId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('customer', input.customerId);
  params.set('line_items[0][price]', HAYASHI_UNLIMITED_PRICE_ID);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', input.successUrl);
  params.set('cancel_url', input.cancelUrl);
  params.set('client_reference_id', input.discordUserId);
  params.set('metadata[discord_user_id]', input.discordUserId);
  params.set('subscription_data[metadata][discord_user_id]', input.discordUserId);
  return stripeFormRequest<{ id: string; url: string | null; customer: string | null }>('/checkout/sessions', params);
}

export async function createBillingPortalSession(input: { customerId: string; returnUrl: string }) {
  const params = new URLSearchParams();
  params.set('customer', input.customerId);
  params.set('return_url', input.returnUrl);
  return stripeFormRequest<{ url: string }>('/billing_portal/sessions', params);
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | undefined, endpointSecret: string): boolean {
  if (!signatureHeader) return false;
  const pieces = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = pieces.find((part) => part.startsWith('t='))?.slice(2);
  const signature = pieces.find((part) => part.startsWith('v1='))?.slice(3);
  if (!timestamp || !signature) return false;

  const expected = createHmac('sha256', endpointSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  const provided = Buffer.from(signature, 'hex');
  const computed = Buffer.from(expected, 'hex');
  return provided.length === computed.length && timingSafeEqual(provided, computed);
}

export function extractSubscriptionPatch(event: unknown): {
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
  status: ReturnType<typeof normalizeSubscriptionStatus>;
  currentPeriodEnd: number | null;
} | null {
  const root = event as {
    data?: { object?: {
      customer?: string | null;
      id?: string | null;
      status?: string | null;
      current_period_end?: number | null;
      items?: { data?: Array<{ price?: { id?: string | null } | null }> | null } | null;
    } | null } | null;
  };
  const subscription = root.data?.object;
  if (!subscription) return null;
  return {
    customerId: subscription.customer ?? null,
    subscriptionId: subscription.id ?? null,
    priceId: subscription.items?.data?.[0]?.price?.id ?? null,
    status: normalizeSubscriptionStatus(subscription.status),
    currentPeriodEnd: subscription.current_period_end ?? null,
  };
}
