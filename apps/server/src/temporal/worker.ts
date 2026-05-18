import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities.js';
import { TEMPORAL_ADDRESS, TEMPORAL_API_KEY, TEMPORAL_ENABLED, TEMPORAL_NAMESPACE } from './config.js';

export async function startTemporalWorker(): Promise<Worker> {
  if (!TEMPORAL_ENABLED) {
    console.warn('[Hayashi] Temporal Cloud not configured. Set TEMPORAL_NAMESPACE and TEMPORAL_API_KEY.');
    throw new Error('Temporal Cloud not configured');
  }

  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
    tls: true,
    apiKey: TEMPORAL_API_KEY,
  });

  // Use compiled JS path so the worker works in both dev and production (dist/)
  const workflowsPath = new URL('./workflows.js', import.meta.url).pathname.replace('/src/', '/dist/');

  const worker = await Worker.create({
    workflowsPath,
    activities,
    taskQueue: 'hayashi-plugin-generation',
    connection,
    namespace: TEMPORAL_NAMESPACE,
  });

  console.log(`[Hayashi] Temporal worker started on ${TEMPORAL_ADDRESS} for task queue: hayashi-plugin-generation`);
  void worker.run().catch((err) => {
    console.error('[Hayashi] Temporal worker run loop crashed:', err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
  return worker;
}
