import Stripe from 'stripe';
import type { BillingRepository } from './repository.js';
import { getBillingRepository } from './repository.js';
import { BillingService, STRIPE_PRICE_CREATOR, STRIPE_PRICE_PRO, STRIPE_PRICE_STUDIO } from './service.js';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
}

function priceToPlan(priceId: string | null): import('./types.js').PlanTier {
  switch (priceId) {
    case STRIPE_PRICE_CREATOR:
      return 'creator';
    case STRIPE_PRICE_PRO:
      return 'pro';
    case STRIPE_PRICE_STUDIO:
      return 'studio';
    default:
      return 'free';
  }
}

export async function handleStripeWebhook(body: string, signature: string): Promise<{ received: boolean; message?: string }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[Hayashi] STRIPE_WEBHOOK_SECRET is not configured');
    return { received: false, message: 'Webhook secret not configured' };
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Hayashi] Stripe webhook signature verification failed:', message);
    return { received: false, message: `Webhook signature verification failed: ${message}` };
  }

  const repository = getBillingRepository();
  const billing = new BillingService(repository);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!customerId || !subscriptionId) {
          console.warn('[Hayashi] checkout.session.completed missing customer or subscription');
          return { received: true };
        }

        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id ?? null;
        const clerkUserId = session.client_reference_id ?? subscription.metadata?.clerkUserId;

        if (!clerkUserId) {
          console.warn('[Hayashi] checkout.session.completed missing clerkUserId');
          return { received: true };
        }

        const user = await billing.getOrCreateUser({ userId: clerkUserId });
        await billing.syncStripeSubscription(user, {
          status: subscription.status as import('./types.js').SubscriptionStatus,
          currentPeriodEnd: (subscription as any).current_period_end * 1000,
          plan: priceToPlan(priceId),
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
        });

        console.log('[Hayashi] Upgraded user to', priceToPlan(priceId), clerkUserId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id ?? null;

        const customer = await getStripe().customers.retrieve(customerId);
        if (customer.deleted) {
          console.warn('[Hayashi] Customer deleted, skipping subscription update');
          return { received: true };
        }

        const clerkUserId = customer.metadata?.clerkUserId;
        if (!clerkUserId) {
          console.warn('[Hayashi] customer.subscription.updated missing clerkUserId in metadata');
          return { received: true };
        }

        const user = await billing.getOrCreateUser({ userId: clerkUserId });
        await billing.syncStripeSubscription(user, {
          status: subscription.status as import('./types.js').SubscriptionStatus,
          currentPeriodEnd: (subscription as any).current_period_end * 1000,
          plan: priceToPlan(priceId),
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
        });

        console.log('[Hayashi] Updated subscription for', clerkUserId, subscription.status);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const customer = await getStripe().customers.retrieve(customerId);
        if (customer.deleted) {
          console.warn('[Hayashi] Customer deleted, skipping subscription deletion');
          return { received: true };
        }

        const clerkUserId = customer.metadata?.clerkUserId;
        if (!clerkUserId) {
          console.warn('[Hayashi] customer.subscription.deleted missing clerkUserId in metadata');
          return { received: true };
        }

        const user = await billing.getOrCreateUser({ userId: clerkUserId });
        await billing.syncStripeSubscription(user, null);

        console.log('[Hayashi] Downgraded user to free', clerkUserId);
        break;
      }

      default:
        console.log('[Hayashi] Unhandled Stripe webhook event:', event.type);
    }

    return { received: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Hayashi] Stripe webhook handler error:', message);
    return { received: false, message };
  }
}
