import WebSocket from 'ws';
import { createDmChannel, sendDiscordMessage, addGuildMemberRole } from './discord.js';
import { handleGuildMemberJoin, SUPPORT_DISCORD_GUILD_ID, SUPPORT_JOINED_ROLE_ID, SUPPORT_VERIFIED_ROLE_ID } from './onboardingService.js';

const DISCORD_GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN?.trim() ?? '';
const RULES_REACTION_MESSAGE_ID = process.env.RULES_REACTION_MESSAGE_ID?.trim() || '1505946455154757775';
const RULES_REACTION_EMOJI_ID = process.env.RULES_REACTION_EMOJI_ID?.trim() || '1505929819903492297';
const RULES_REACTION_EMOJI_NAME = process.env.RULES_REACTION_EMOJI_NAME?.trim() || 'hayashilogo';

function botEnabled() {
  return !!(DISCORD_BOT_TOKEN && SUPPORT_DISCORD_GUILD_ID && SUPPORT_JOINED_ROLE_ID);
}

function isRulesReaction(payload: any) {
  const messageId = payload?.message_id as string | undefined;
  const guildId = payload?.guild_id as string | undefined;
  const emojiId = payload?.emoji?.id as string | undefined;
  const emojiName = payload?.emoji?.name as string | undefined;

  if (guildId !== SUPPORT_DISCORD_GUILD_ID) return false;
  if (messageId !== RULES_REACTION_MESSAGE_ID) return false;
  if (emojiId) return emojiId === RULES_REACTION_EMOJI_ID;
  return emojiName === RULES_REACTION_EMOJI_NAME;
}

async function sendRulesWelcomeDm(discordUserId: string) {
  const channelId = await createDmChannel(discordUserId);
  await sendDiscordMessage(channelId, {
    embeds: [
      {
        title: 'You are in. Here is how to start with Hayashi.',
        description: [
          'Hayashi lets you prompt a generative model and get optimized DSP code that can be compiled into native **VST3** or **CLAP** plugins for FL Studio and other modern DAWs.',
          '',
          'Generated plugins come with templated UI, support multiple platforms, and can be shared with links like:',
          'https://dev.tryhayashi.com/share?plugin=plugin-1779074669049-4b6cd7',
        ].join('\n'),
        color: 0x6f9e42,
        fields: [
          {
            name: 'What you can generate',
            value: [
              '• Reverbs (multiple types)',
              '• Synths',
              '• Delay Echo',
              '• Parametric EQ',
              '• Oscillators (e.g. low frequency)',
            ].join('\n'),
          },
          {
            name: 'Get started',
            value: [
              '1. Go to https://tryhayashi.com/',
              '2. Create your free account',
              '3. Prompt your first plugin',
              '4. Preview it in-browser',
              '5. Export when you are ready',
            ].join('\n'),
          },
          {
            name: 'Free vs paid',
            value: 'Free gets you started. If you want to go above 5 generations per day, move up to Creator or higher.',
          },
          {
            name: 'Creator ($29.99/mo)',
            value: [
              '• Unlimited plugin generations',
              '• Browser playback',
              '• 5–10 VST exports / month',
            ].join('\n'),
            inline: true,
          },
          {
            name: 'Pro ($99.99/mo)',
            value: [
              '• Unlimited plugin generations',
              '• 20 VST + CLAP exports / month',
              '• Audio feature extraction',
            ].join('\n'),
            inline: true,
          },
          {
            name: 'Studio ($299.99/mo)',
            value: [
              '• API access (usage-based)',
              '• Unlimited VST + CLAP exports',
              '• Dedicated compute (coming soon)',
            ].join('\n'),
            inline: true,
          },
        ],
        footer: {
          text: 'Hayashi • prompt to plugin',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

async function handleRulesReactionAdd(payload: any) {
  const userId = payload?.user_id as string | undefined;
  const isBotUser = !!payload?.member?.user?.bot;
  if (!userId || isBotUser) return;

  await addGuildMemberRole(SUPPORT_DISCORD_GUILD_ID, userId, SUPPORT_VERIFIED_ROLE_ID);
  await sendRulesWelcomeDm(userId);
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
              intents: 1 | 2 | 1024,
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

          if (payload.t === 'MESSAGE_REACTION_ADD' && isRulesReaction(payload.d)) {
            void handleRulesReactionAdd(payload.d).catch((error) => {
              console.error('[Hayashi] Rules reaction onboarding failed:', error instanceof Error ? error.message : String(error));
            });
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
