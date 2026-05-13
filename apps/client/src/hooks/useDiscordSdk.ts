import { useEffect, useState, useRef } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { DISCORD_CLIENT_ID } from '@/lib/constants';
import { exchangeDiscordAuthCode } from '@/lib/api';

let discordSdk: DiscordSDK | null = null;

function getDiscordSdk(): DiscordSDK | null {
  if (!discordSdk) {
    try {
      discordSdk = new DiscordSDK(DISCORD_CLIENT_ID ?? 'missing-client-id');
    } catch (e) {
      console.error('[Hayashi] DiscordSDK constructor failed:', e);
      return null;
    }
  }
  return discordSdk;
}

export interface DiscordParticipant {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator: string;
  avatar?: string | null;
  flags: number;
  bot: boolean;
  avatar_decoration_data?: { asset: string; skuId?: string } | null;
  premium_type?: number | null;
  nickname?: string | null;
}

interface DiscordContext {
  ready: boolean;
  channelId: string | null;
  guildId: string | null;
  instanceId: string | null;
  user: { id: string; username: string; avatar: string | null } | null;
  accessToken: string | null;
  error: string | null;
  participants: DiscordParticipant[];
}

export function isRunningInDiscord(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('frame_id');
}

export async function openExternalUrl(url: string): Promise<boolean> {
  const sdk = getDiscordSdk();
  if (sdk && isRunningInDiscord()) {
    try {
      const result = await sdk.commands.openExternalLink({ url });
      return Boolean(result?.opened);
    } catch (error) {
      console.warn('[Hayashi] openExternalLink failed, falling back to browser navigation:', error);
    }
  }

  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.assign(url);
    return true;
  }
  return true;
}

export async function openInviteDialog(): Promise<boolean> {
  const sdk = getDiscordSdk();
  if (sdk && isRunningInDiscord()) {
    try {
      await sdk.commands.openInviteDialog();
      return true;
    } catch (error) {
      console.warn('[Hayashi] openInviteDialog failed:', error);
      return false;
    }
  }

  console.warn('[Hayashi] openInviteDialog called outside Discord');
  return false;
}

export async function startDiscordPurchase(skuId: string): Promise<boolean> {
  const sdk = getDiscordSdk();
  if (!sdk || !isRunningInDiscord()) {
    console.warn('[Hayashi] startPurchase called outside Discord');
    return false;
  }
  try {
    await sdk.commands.startPurchase({ sku_id: skuId });
    return true;
  } catch (error) {
    console.warn('[Hayashi] startPurchase failed:', error);
    return false;
  }
}

function getAvatarUrl(userId: string, avatar: string | null | undefined): string {
  if (avatar) {
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
  }
  const defaultIndex = parseInt(userId.slice(-1), 10) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}

function normalizeSdkUser(
  user:
    | {
        id: string;
        username: string;
        discriminator?: string;
        global_name?: string | null;
        avatar?: string | null;
        bot?: boolean;
        flags?: number | null;
        premium_type?: number | null;
        avatar_decoration_data?: { asset: string; sku_id?: string } | null;
      }
    | null
    | undefined
): { id: string; username: string; avatar: string | null } | null {
  if (!user) return null;
  return {
    id: user.id,
    username: user.global_name ?? user.username,
    avatar: user.avatar ?? null,
  };
}

function toParticipant(user: { id: string; username: string; avatar: string | null }): DiscordParticipant {
  return {
    id: user.id,
    username: user.username,
    global_name: user.username,
    discriminator: '0',
    avatar: user.avatar,
    flags: 0,
    bot: false,
  };
}

export function useDiscordSdk(): DiscordContext {
  const [state, setState] = useState<DiscordContext>({
    ready: false,
    channelId: null,
    guildId: null,
    instanceId: null,
    user: null,
    accessToken: null,
    error: null,
    participants: [],
  });

  const participantsRef = useRef<DiscordParticipant[]>([]);
  const subscribedRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    async function init() {
      if (initializedRef.current) return;
      initializedRef.current = true;

      const params = new URLSearchParams(window.location.search);
      console.log('[Hayashi] URL params:', Object.fromEntries(params.entries()));
      console.log('[Hayashi] CLIENT_ID present:', !!DISCORD_CLIENT_ID);

      if (!isRunningInDiscord()) {
        console.log('[Hayashi] Running outside Discord iframe — dev mode');
        const channelId = params.get('channel_id') ?? 'local-dev-channel';
        const guildId = params.get('guild_id') ?? null;
        const userId = params.get('user_id') ?? 'local-user';
        const username = params.get('username') ?? 'Local Dev';
        const instanceId = params.get('instance_id') ?? `local-${crypto.randomUUID()}`;

        const mockParticipants: DiscordParticipant[] = [
          {
            id: userId,
            username,
            global_name: username,
            discriminator: '0',
            avatar: null,
            flags: 0,
            bot: false,
          },
        ];

        setState({
          ready: true,
          channelId,
          guildId,
          instanceId,
          user: { id: userId, username, avatar: null },
          accessToken: 'local-dev-access-token',
          error: null,
          participants: mockParticipants,
        });
        participantsRef.current = mockParticipants;
        return;
      }

      console.log('[Hayashi] Running inside Discord iframe');

      const sdk = getDiscordSdk();
      if (!sdk) {
        throw new Error('Discord SDK could not be created. Check console for details.');
      }

      await sdk.ready();
      console.log('[Hayashi] sdk.ready() resolved');

      if (!DISCORD_CLIENT_ID) {
        console.warn('[Hayashi] VITE_DISCORD_CLIENT_ID is missing — running in fallback mode');
        setState({
          ready: true,
          channelId: params.get('channel_id') ?? 'unknown-channel',
          guildId: params.get('guild_id') ?? null,
          instanceId: params.get('instance_id') ?? 'unknown-instance',
          user: { id: 'unknown-user', username: 'Unknown', avatar: null },
          accessToken: null,
          error: 'VITE_DISCORD_CLIENT_ID is missing. Add it to apps/client/.env and reload.',
          participants: [],
        });
        return;
      }

      let user = null;
      let accessToken: string | null = null;

      const { channel_id, guild_id } = sdk.channelId
        ? { channel_id: sdk.channelId, guild_id: null }
        : { channel_id: null, guild_id: null };

      const fallbackChannelId = params.get('channel_id') ?? channel_id;
      const fallbackGuildId = params.get('guild_id') ?? guild_id;

      /* Use iframe query params only as a last-resort fallback. */
      const urlUserId = params.get('user_id');
      const urlUsername = params.get('username');
      if (urlUserId && urlUsername) {
        user = { id: urlUserId, username: urlUsername, avatar: null };
      }

      try {
        const authCode = await sdk.commands.authorize({
          client_id: DISCORD_CLIENT_ID,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify', 'email'],
        });
        const token = await exchangeDiscordAuthCode(authCode.code);
        accessToken = token.access_token;
        const auth = await sdk.commands.authenticate({ access_token: accessToken });
        console.log('[Hayashi] authenticate() resolved', auth);
        user = normalizeSdkUser(auth.user) ?? user;

        try {
          await sdk.subscribe('CURRENT_USER_UPDATE', (eventData: {
            id: string;
            username: string;
            discriminator: string;
            bot: boolean;
            avatar_decoration_data: { asset: string; sku_id?: string } | null;
            avatar?: string | null;
            global_name?: string | null;
            flags?: number | null;
            premium_type?: number | null;
          }) => {
            const nextUser = normalizeSdkUser(eventData);
            if (!nextUser) return;
            setState((s) => {
              const participants = s.participants.some((p) => p.id === nextUser.id)
                ? s.participants
                : [toParticipant(nextUser), ...s.participants];
              participantsRef.current = participants;
              return { ...s, user: nextUser, participants };
            });
          });
          console.log('[Hayashi] Subscribed to CURRENT_USER_UPDATE');
        } catch (currentUserErr) {
          console.warn('[Hayashi] Subscribe to CURRENT_USER_UPDATE failed:', currentUserErr);
        }
      } catch (authErr) {
        console.warn('[Hayashi] Discord OAuth/authenticate failed:', authErr);
      }

      let participants: DiscordParticipant[] = [];

      if (accessToken) {
        try {
          const result = await sdk.commands.getInstanceConnectedParticipants();
          participants = (result?.participants ?? []) as DiscordParticipant[];
          console.log('[Hayashi] Connected participants:', participants.length);
        } catch (participantsErr) {
          console.warn('[Hayashi] getInstanceConnectedParticipants failed:', participantsErr);
        }

        if (!subscribedRef.current) {
          try {
            await sdk.subscribe(
              'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
              (eventData: { participants?: DiscordParticipant[] }) => {
                const updated = eventData?.participants ?? [];
                console.log('[Hayashi] Participants update:', updated.length);
                participantsRef.current = updated;
                setState((s) => ({ ...s, participants: updated }));
              }
            );
            subscribedRef.current = true;
            console.log('[Hayashi] Subscribed to ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE');
          } catch (subErr) {
            console.warn('[Hayashi] Subscribe to participants failed:', subErr);
          }
        }

        if (!subscribedRef.current) {
          try {
            await sdk.subscribe(
              'ENTITLEMENT_CREATE',
              () => {
                console.log('[Hayashi] Entitlement created — refreshing billing');
              }
            );
            console.log('[Hayashi] Subscribed to ENTITLEMENT_CREATE');
          } catch (entErr) {
            console.warn('[Hayashi] Subscribe to ENTITLEMENT_CREATE failed:', entErr);
          }
        }
      }

      if (!user && participants.length > 0) {
        const currentParticipant = participants[0];
        user = {
          id: currentParticipant.id,
          username: currentParticipant.global_name ?? currentParticipant.username,
          avatar: currentParticipant.avatar ?? null,
        };
      }

      // Always include at least the local user as a participant
      if (user && !participants.some((p) => p.id === user.id)) {
        participants = [toParticipant(user), ...participants];
      }

      participantsRef.current = participants;

      setState({
        ready: true,
        channelId: fallbackChannelId,
        guildId: fallbackGuildId,
        instanceId: sdk.instanceId,
        user: user
          ? {
              id: user.id,
              username: user.username,
              avatar: user.avatar ?? null,
            }
          : null,
        accessToken,
        error: null,
        participants,
      });
    }

    init().catch((err) => {
      console.error('[Hayashi] Discord SDK init failed:', err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null
            ? JSON.stringify(err)
            : String(err);
      setState((s) => ({ ...s, ready: true, error: message }));
    });
  }, []);

  return state;
}

export { getDiscordSdk, getAvatarUrl };
