import { randomUUID } from 'crypto';
import type { BillingSnapshot, BillingUserRecord } from './types.js';
import type { BillingService } from './service.js';

interface StreamTokenRecord {
  clerkUserId: string;
  expiresAt: number;
}

interface BillingSubscriber {
  id: string;
  clerkUserId: string;
  send: (event: string, snapshot: BillingSnapshot) => void;
  close: () => void;
}

const streamTokens = new Map<string, StreamTokenRecord>();
const subscribers = new Map<string, BillingSubscriber>();

const STREAM_TOKEN_TTL_MS = 10 * 60 * 1000;

export function mintBillingStreamToken(clerkUserId: string): string {
  const token = randomUUID();
  streamTokens.set(token, {
    clerkUserId,
    expiresAt: Date.now() + STREAM_TOKEN_TTL_MS,
  });
  return token;
}

export function consumeBillingStreamToken(token: string): StreamTokenRecord | null {
  const record = streamTokens.get(token);
  if (!record) return null;
  streamTokens.delete(token);
  if (record.expiresAt < Date.now()) return null;
  return record;
}

export function addBillingSubscriber(input: Omit<BillingSubscriber, 'id'>): string {
  const id = randomUUID();
  subscribers.set(id, { id, ...input });
  return id;
}

export function removeBillingSubscriber(id: string) {
  const subscriber = subscribers.get(id);
  if (!subscriber) return;
  subscribers.delete(id);
  subscriber.close();
}

export async function publishBillingUpdate(service: BillingService, user: BillingUserRecord) {
  for (const subscriber of subscribers.values()) {
    if (subscriber.clerkUserId !== user.clerkUserId) continue;
    const snapshot = await service.buildSnapshot(user);
    subscriber.send('billing.updated', snapshot);
  }
}
