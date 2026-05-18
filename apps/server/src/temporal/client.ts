import { Connection, Client } from '@temporalio/client';
import { TEMPORAL_ADDRESS, TEMPORAL_API_KEY, TEMPORAL_ENABLED, TEMPORAL_NAMESPACE } from './config.js';

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  if (!TEMPORAL_ENABLED) {
    throw new Error('Temporal Cloud not configured. Set TEMPORAL_NAMESPACE and TEMPORAL_API_KEY.');
  }

  const connection = await Connection.connect({
    address: TEMPORAL_ADDRESS,
    apiKey: TEMPORAL_API_KEY,
    tls: true,
  });

  client = new Client({
    connection,
    namespace: TEMPORAL_NAMESPACE,
  });

  return client;
}
