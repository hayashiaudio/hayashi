import WebSocket from 'ws';
import { handleGuildMemberJoin, SUPPORT_DISCORD_GUILD_ID, SUPPORT_JOINED_ROLE_ID } from './onboardingService.js';

const DISCORD_GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN?.trim() ?? '';

function botEnabled() {
  return !!(DISCORD_BOT_TOKEN && SUPPORT_DISCORD_GUILD_ID && SUPPORT_JOINED_ROLE_ID);
}

export async function startDiscordOnboardingBot(): Promise<void> {
  if (!botEnabled()) {
    console.log('[Hayashi] Discord onboarding bot disabled: missing token, guild, or joined role configuration.');
    return new Promise(() => {});
  }

  async function runGatewayLoop() {
    await new Promise<void>((resolve) => {
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let acknowledgedReady = false;
      const ws = new WebSocket(DISCORD_GATEWAY_URL);

      const cleanup = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      };

      ws.on('open', () => {
        console.log('[Hayashi] Discord onboarding gateway connected.');
      });

      ws.on('message', (raw) => {
        try {
          const payload = JSON.parse(raw.toString()) as { op: number; t?: string; d?: any };

          if (payload.op === 10) {
            const interval = payload.d?.heartbeat_interval ?? 45000;
          ws.send(JSON.stringify({
            op: 2,
            d: {
              token: DISCORD_BOT_TOKEN,
              intents: 1 | 2,
              presence: {
                since: null,
                afk: false,
                status: 'online',
                activities: [
                  {
                    name: 'Hayashi support',
                    type: 3,
                  },
                ],
              },
              properties: {
                os: process.platform,
                browser: 'hayashi-onboarding',
                  device: 'hayashi-onboarding',
                },
              },
            }));
            heartbeatTimer = setInterval(() => {
              ws.send(JSON.stringify({ op: 1, d: null }));
            }, interval);
            return;
          }

          if (payload.op === 11) return;

          if (payload.t === 'READY' && !acknowledgedReady) {
            acknowledgedReady = true;
            console.log('[Hayashi] Discord onboarding bot ready.');
            return;
          }

          if (payload.t === 'GUILD_MEMBER_ADD') {
            const guildId = payload.d?.guild_id as string | undefined;
            const userId = payload.d?.user?.id as string | undefined;
            if (guildId === SUPPORT_DISCORD_GUILD_ID && userId) {
              void handleGuildMemberJoin(userId).catch((error) => {
                console.error('[Hayashi] Guild join onboarding sync failed:', error instanceof Error ? error.message : String(error));
              });
            }
          }
        } catch (error) {
          console.error('[Hayashi] Discord onboarding gateway parse failed:', error instanceof Error ? error.message : String(error));
        }
      });

      ws.on('error', (error) => {
        cleanup();
        console.error('[Hayashi] Discord onboarding gateway error:', error.message);
      });

      ws.on('close', () => {
        cleanup();
        console.warn('[Hayashi] Discord onboarding gateway closed.');
        resolve();
      });
    });
  }

  for (;;) {
    try {
      await runGatewayLoop();
    } catch (error) {
      console.error('[Hayashi] Discord onboarding gateway loop failed:', error instanceof Error ? error.message : String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return new Promise(() => {});
}
