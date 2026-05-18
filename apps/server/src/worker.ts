import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { TEMPORAL_ADDRESS, TEMPORAL_ENABLED, TEMPORAL_NAMESPACE } from './temporal/config.js';
import { startTemporalWorker } from './temporal/worker.js';
import { startDiscordOnboardingBot } from './support/onboardingBot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

async function main() {
  if (!TEMPORAL_ENABLED && !(process.env.DISCORD_BOT_TOKEN && process.env.SUPPORT_DISCORD_GUILD_ID)) {
    console.error('[Hayashi] Worker process requires Temporal or Discord onboarding bot configuration.');
    process.exit(1);
  }

  if (process.env.DISCORD_BOT_TOKEN && process.env.SUPPORT_DISCORD_GUILD_ID) {
    void startDiscordOnboardingBot().catch((err) => {
      console.error('[Hayashi] Discord onboarding bot crashed:', err instanceof Error ? err.message : String(err));
    });
  }

  if (!TEMPORAL_ENABLED) {
    console.log('[Hayashi] Worker process running Discord onboarding bot without Temporal.');
    await new Promise(() => {});
    return;
  }

  try {
    await startTemporalWorker();
    console.log(`[Hayashi] Worker process booted for namespace ${TEMPORAL_NAMESPACE} at ${TEMPORAL_ADDRESS}`);
  } catch (err) {
    console.error('[Hayashi] Failed to start Temporal worker:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  void main();
}
