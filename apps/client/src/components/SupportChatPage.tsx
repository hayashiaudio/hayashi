import { useEffect, useMemo, useRef, useState } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth, useUser } from '@clerk/clerk-react';
import {
  AlertTriangle,
  Ban,
  Crown,
  ExternalLink,
  FileText,
  LifeBuoy,
  Lock,
  Paperclip,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useClerkToken } from '@/hooks/useClerkToken';
import {
  blockSupportThread,
  createSupportThread,
  loadSupportSession,
  loadSupportThread,
  sendSupportMessage,
  type SupportMessage,
  type SupportProfile,
  type SupportThread,
} from '@/lib/supportChat';
import { useSessionStore } from '@/stores/sessionStore';
import { PluginLibrary } from './PluginLibrary';
import { usePluginStore } from '@/stores/pluginStore';
import { buildPluginPath } from '@/lib/pluginRoutes';

const OWNER_ID = '1387255717794152519';

function readQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    userId: params.get('userId'),
    threadId: params.get('threadId'),
  };
}

function setThreadQuery(userId: string, threadId: string) {
  const url = new URL(window.location.href);
  url.pathname = '/chat';
  url.searchParams.set('userId', userId);
  url.searchParams.set('threadId', threadId);
  window.history.replaceState({}, '', url.toString());
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(value);
}

function getDiscordUserId(user: unknown): string | null {
  const externalAccounts = (user as { externalAccounts?: Array<{ provider?: string; providerUserId?: string }> } | null)?.externalAccounts ?? [];
  const account = externalAccounts.find((item) => item.provider === 'discord' || item.provider === 'oauth_discord');
  return account?.providerUserId ?? null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'H';
}

function isImageAttachment(contentType: string | null, url: string) {
  return (contentType ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url);
}

function isGifAttachment(contentType: string | null, url: string) {
  return (contentType ?? '').includes('gif') || /\.gif($|\?)/i.test(url);
}

function isImageUrl(url: string | null | undefined) {
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|avif|svg)($|\?)/i.test(url);
}

function toFileSize(size: number | null) {
  if (!size) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function Avatar({ profile, tone }: { profile: Pick<SupportProfile, 'displayName' | 'avatarUrl'> | null; tone?: 'support' | 'customer' | 'system' }) {
  const style = tone === 'customer'
    ? { background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)', color: '#10261d' }
    : tone === 'system'
      ? { background: 'rgba(180,83,9,0.12)', color: '#92400e' }
      : { background: 'rgba(16,38,29,0.92)', color: '#f7f0e3' };

  if (profile?.avatarUrl) {
    return <img src={profile.avatarUrl} alt={profile.displayName} className="h-10 w-10 rounded-xl object-cover shadow-[0_12px_24px_rgba(16,38,29,0.12)]" />;
  }

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-black uppercase tracking-[0.12em] shadow-[0_12px_24px_rgba(16,38,29,0.12)]"
      style={style}
    >
      {initials(profile?.displayName ?? 'Hayashi')}
    </div>
  );
}

function resolveMessageProfile(message: SupportMessage, thread: SupportThread) {
  if (message.metadataJson?.author) {
    return {
      discordUserId: message.metadataJson.author.discordUserId ?? '',
      username: message.metadataJson.author.username ?? message.metadataJson.author.displayName,
      displayName: message.metadataJson.author.displayName,
      avatarUrl: message.metadataJson.author.avatarUrl,
    } satisfies SupportProfile;
  }
  if (message.authorRole === 'support') return thread.ownerProfile;
  if (message.authorRole === 'customer') return thread.customerProfile;
  return null;
}

function MessageAttachments({ message }: { message: SupportMessage }) {
  const attachments = message.metadataJson?.attachments ?? [];
  const embeds = message.metadataJson?.embeds ?? [];
  const media = [
    ...attachments
      .filter((attachment) => isImageAttachment(attachment.contentType, attachment.url))
      .map((attachment) => ({
        key: `${attachment.url}:${attachment.filename}`,
        url: attachment.url,
        label: attachment.filename,
        gif: isGifAttachment(attachment.contentType, attachment.url),
      })),
    ...embeds
      .map((embed, index) => ({
        key: `${embed.imageUrl ?? embed.thumbnailUrl ?? embed.url ?? index}`,
        url: embed.imageUrl ?? embed.thumbnailUrl ?? embed.url,
        label: embed.title ?? embed.providerName ?? 'Embed',
        gif: embed.type === 'gifv' || /\.gif($|\?)/i.test(embed.url ?? ''),
      }))
      .filter((embed): embed is { key: string; url: string; label: string; gif: boolean } => !!embed.url && isImageUrl(embed.url)),
  ];

  const files = attachments.filter((attachment) => !isImageAttachment(attachment.contentType, attachment.url));
  const linkEmbeds = embeds.filter((embed) => !isImageUrl(embed.imageUrl ?? embed.thumbnailUrl ?? embed.url));

  if (!media.length && !files.length && !linkEmbeds.length) return null;

  return (
    <div className="mt-3 space-y-3">
      {media.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {media.map((item) => (
            <a
              key={item.key}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-[18px] border border-[#183324]/10 bg-[#f8f3e7] shadow-[0_16px_32px_rgba(16,38,29,0.08)]"
            >
              <img src={item.url} alt={item.label} className="h-auto max-h-[260px] w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
              <div className="flex items-center justify-between gap-2 border-t border-[#183324]/8 px-3 py-2 text-[11px] text-[#5e6555]">
                <span className="truncate">{item.label}</span>
                <span className="font-semibold uppercase tracking-[0.14em] text-[#9a6a32]">{item.gif ? 'GIF' : 'Image'}</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((attachment) => (
            <a
              key={attachment.url}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-[16px] border border-[#183324]/10 bg-[#f8f3e7] px-3 py-3 text-sm text-[#193125] transition hover:border-[#d48c2e]/28"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10261d] text-[#f7f0e3]">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{attachment.filename}</div>
                  <div className="text-xs text-[#6d775e]">{toFileSize(attachment.size) ?? attachment.contentType ?? 'Attachment'}</div>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 flex-shrink-0 text-[#9a6a32]" />
            </a>
          ))}
        </div>
      )}

      {linkEmbeds.length > 0 && (
        <div className="space-y-2">
          {linkEmbeds.map((embed, index) => (
            <a
              key={`${embed.url ?? index}:${embed.title ?? embed.providerName ?? index}`}
              href={embed.url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="block rounded-[16px] border border-[#183324]/10 bg-[#f8f3e7] px-4 py-3 transition hover:border-[#d48c2e]/28"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a6a32]">{embed.providerName ?? embed.type ?? 'Discord embed'}</div>
              {(embed.title || embed.description) && (
                <div className="mt-2">
                  {embed.title && <div className="text-sm font-semibold text-[#10261d]">{embed.title}</div>}
                  {embed.description && <div className="mt-1 text-sm leading-6 text-[#4f5f51]">{embed.description}</div>}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SupportMessageRow({ message, thread }: { message: SupportMessage; thread: SupportThread }) {
  const profile = resolveMessageProfile(message, thread);
  const isSystem = message.authorRole === 'system';
  const roleTone = isSystem ? 'system' : message.authorRole === 'customer' ? 'customer' : 'support';
  const authorName = isSystem ? 'System' : profile?.displayName ?? (message.authorRole === 'customer' ? 'Customer' : 'Support');

  return (
    <div className={`flex gap-3 ${isSystem ? 'rounded-[18px] border border-[#b45309]/18 bg-[rgba(180,83,9,0.08)] px-4 py-3' : ''}`}>
      <div className="pt-0.5">
        <Avatar profile={profile} tone={roleTone} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-bold text-[#10261d]">{authorName}</span>
          <span className="text-[11px] uppercase tracking-[0.12em] text-[#7d876d]">{formatTime(message.createdAt)}</span>
          {!isSystem && (
            <span className="rounded-full bg-[#efe6d2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b5a20]">
              {message.source}
            </span>
          )}
        </div>
        {message.content ? (
          <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-7 text-[#2f4938]">{message.content}</div>
        ) : (
          <div className="mt-1 text-sm italic text-[#66725f]">Attachment only</div>
        )}
        <MessageAttachments message={message} />
      </div>
    </div>
  );
}

function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (!files.length) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {files.map((file, index) => (
        <div
          key={`${file.name}:${file.size}:${index}`}
          className="flex items-center gap-2 rounded-full border border-[#183324]/10 bg-[#f8f3e7] px-3 py-2 text-xs text-[#294232]"
        >
          <Paperclip className="h-3.5 w-3.5 text-[#9a6a32]" />
          <span className="max-w-[180px] truncate font-medium">{file.name}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded-full p-0.5 text-[#6d775e] transition hover:bg-[#183324]/8 hover:text-[#10261d]"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SupportChatPage() {
  const { getToken } = useClerkToken();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { locked } = useSessionStore();
  const activePlugin = usePluginStore((s) => s.plugins.find((p) => p.id === s.activePluginId));
  const [session, setSession] = useState<Awaited<ReturnType<typeof loadSupportSession>> | null>(null);
  const [activeThread, setActiveThread] = useState<SupportThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [newThreadText, setNewThreadText] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [newThreadFiles, setNewThreadFiles] = useState<File[]>([]);
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);
  const newThreadFileInputRef = useRef<HTMLInputElement | null>(null);

  const query = useMemo(() => readQuery(), []);
  const discordUserId = query.userId ?? getDiscordUserId(user);
  const isOwner = session?.isOwner ?? discordUserId === OWNER_ID;
  const supportLocked = locked || !!session?.requiresDiscordJoin || !!session?.requiresTermsAcceptance || !!session?.requiresPrivacyAcceptance;
  const supportDisplayName = activeThread?.ownerProfile.displayName ?? session?.ownerProfile.displayName ?? 'Hayashi Support';

  function navigateHome() {
    const params = new URLSearchParams();
    if (query.userId) params.set('userId', query.userId);
    const search = params.toString();
    window.location.href = search ? `/?${search}` : '/';
  }

  function navigateWorkspace() {
    if (!activePlugin) return;
    window.location.href = buildPluginPath(activePlugin.id, activePlugin.name);
  }

  function navigatePricing() {
    const params = new URLSearchParams();
    if (user?.id) params.set('userId', user.id);
    const search = params.toString();
    window.location.href = search ? `/pricing?${search}` : '/pricing';
  }

  function navigatePolicy(policy: 'terms' | 'privacy') {
    const params = new URLSearchParams();
    if (discordUserId) params.set('userId', discordUserId);
    const search = params.toString();
    const pathname = policy === 'terms' ? '/terms' : '/privacy';
    window.location.href = search ? `${pathname}?${search}` : pathname;
  }

  function appendFiles(files: FileList | null, target: 'composer' | 'thread') {
    if (!files?.length) return;
    const next = Array.from(files);
    if (target === 'composer') {
      setComposerFiles((current) => [...current, ...next]);
    } else {
      setNewThreadFiles((current) => [...current, ...next]);
    }
  }

  function resetThreadComposer() {
    setNewThreadText('');
    setNewThreadFiles([]);
    if (newThreadFileInputRef.current) newThreadFileInputRef.current.value = '';
  }

  function resetReplyComposer() {
    setComposer('');
    setComposerFiles([]);
    if (composerFileInputRef.current) composerFileInputRef.current.value = '';
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setLoading(false);
        return;
      }
      if (!discordUserId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) {
            setLoading(false);
            setError('Waiting for authenticated session...');
          }
          return;
        }
        const nextSession = await loadSupportSession(token, discordUserId);
        if (cancelled) return;
        setSession(nextSession);

        const requestedThreadId = readQuery().threadId;
        const defaultThreadId = requestedThreadId ?? nextSession.threads[0]?.id ?? null;
        if (defaultThreadId) {
          const thread = await loadSupportThread(token, defaultThreadId, nextSession.discordUserId);
          if (cancelled) return;
          setActiveThread(thread);
          setThreadQuery(nextSession.discordUserId, thread.id);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load support chat');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [discordUserId, getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!activeThread || !session?.discordUserId) return;
    const timer = window.setInterval(async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const refreshed = await loadSupportThread(token, activeThread.id, session.discordUserId);
        setActiveThread(refreshed);
      } catch {
        // keep existing UI until next poll
      }
    }, 8000);
    return () => window.clearInterval(timer);
  }, [activeThread?.id, getToken, session?.discordUserId]);

  async function handleCreateThread() {
    if (!session?.discordUserId || (!newThreadText.trim() && newThreadFiles.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Waiting for authenticated session...');
        return;
      }
      const thread = await createSupportThread(token, session.discordUserId, supportDisplayName, newThreadText.trim(), newThreadFiles);
      resetThreadComposer();
      setActiveThread(thread);
      setThreadQuery(session.discordUserId, thread.id);
      const nextSession = await loadSupportSession(token, session.discordUserId);
      setSession(nextSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create support thread');
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (!activeThread || !session?.discordUserId || (!composer.trim() && composerFiles.length === 0)) return;
    setSending(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Waiting for authenticated session...');
        return;
      }
      const thread = await sendSupportMessage(token, activeThread.id, session.discordUserId, composer.trim(), composerFiles);
      resetReplyComposer();
      setActiveThread(thread);
      const nextSession = await loadSupportSession(token, session.discordUserId);
      setSession(nextSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send support message');
    } finally {
      setSending(false);
    }
  }

  async function handleBlock() {
    if (!activeThread) return;
    setBlocking(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Waiting for authenticated session...');
        return;
      }
      const thread = await blockSupportThread(token, activeThread.id, 'Rude or confrontational behavior');
      setActiveThread(thread);
      if (session?.discordUserId) {
        const nextSession = await loadSupportSession(token, session.discordUserId);
        setSession(nextSession);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block thread');
    } finally {
      setBlocking(false);
    }
  }

  async function handleSelectThread(threadId: string) {
    if (!session?.discordUserId) return;
    const token = await getToken();
    if (!token) return;
    const full = await loadSupportThread(token, threadId, session.discordUserId);
    setActiveThread(full);
    setThreadQuery(session.discordUserId, threadId);
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0a0a0a] text-[#e5e5e5]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-[rgba(255,255,255,0.06)] px-3 sm:px-5 sm:gap-4">
        <div className="flex items-center gap-2.5">
          <button type="button" className="flex items-center gap-2.5" onClick={navigateHome}>
            <img src="/hayashi-logo.png" alt="Hayashi" className="h-7 w-7 rounded object-contain" />
            <span className="hidden text-sm font-bold tracking-[0.15em] sm:inline-block">HAYASHI</span>
          </button>
          <Badge variant="outline" className="ml-2 h-5 rounded-full border-[#ff8c61]/30 text-[10px] text-[#ff8c61]">BETA</Badge>
        </div>
        <div className="flex-1" />
        <div className="hidden items-center gap-1 md:flex">
          <Button variant="ghost" size="sm" className="h-8 rounded-md text-xs font-medium text-[#737373] hover:bg-white/5 hover:text-[#e5e5e5]" onClick={navigateHome}>Generate</Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-md text-xs font-medium text-[#737373] hover:bg-white/5 hover:text-[#e5e5e5]"
            onClick={navigateWorkspace}
            disabled={!activePlugin}
          >
            Workspace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-md bg-white/5 text-xs font-medium text-[#e5e5e5] hover:bg-white/10 hover:text-[#e5e5e5]"
          >
            Support
          </Button>
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-md border-[#d48c2e]/30 bg-[#fff7e8] px-3 text-[11px] text-[#a05b1d] hover:bg-[#d48c2e]/10"
          onClick={navigatePricing}
        >
          <Crown className="h-3.5 w-3.5" /> Upgrade
        </Button>
        <SignedIn>
          <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-7 w-7' } }} />
        </SignedIn>
        <SignedOut>
          <SignInButton>
            <Button size="sm" className="h-8 rounded-md gap-1.5 text-xs font-bold" style={{ background: '#ff8c61', color: '#0a0a0a', border: 'none' }}>
              <Lock className="h-3.5 w-3.5" /> Sign In
            </Button>
          </SignInButton>
        </SignedOut>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <PluginLibrary
          supportArchive={{
            threads: (session?.threads ?? []).map((thread) => ({
              id: thread.id,
              title: session?.isOwner ? thread.title : session?.ownerProfile.displayName ?? thread.title,
              status: thread.status,
              contextSummary: thread.contextSummary,
              updatedAt: thread.updatedAt,
            })),
            activeThreadId: activeThread?.id ?? null,
            loading,
            onSelect: (threadId) => { void handleSelectThread(threadId); },
          }}
        />
        <main className="hayashi-scroll flex-1 overflow-auto bg-[#f4efdf]">
          <div className="mx-auto max-w-[1550px] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
            <section
              className="overflow-hidden rounded-[36px] border border-[#183324]/12 shadow-[0_30px_80px_rgba(16,38,29,0.10)]"
              style={{ background: 'linear-gradient(135deg, rgba(255,247,231,0.95) 0%, rgba(243,236,215,0.96) 48%, rgba(231,245,221,0.92) 100%)' }}
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl px-5 py-6 sm:px-8">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="h-7 rounded-full border-[#183324]/14 bg-white/55 px-3 text-[11px] font-semibold text-[#294232] shadow-[0_8px_20px_rgba(16,38,29,0.06)]">
                      <LifeBuoy className="mr-1.5 h-3.5 w-3.5" /> Discord support
                    </Badge>
                    <Badge variant="outline" className="h-7 rounded-full border-[#183324]/14 bg-[#f3ecd7] px-3 text-[11px] font-semibold text-[#56763c] shadow-[0_8px_20px_rgba(16,38,29,0.04)]">
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Azure context fill
                    </Badge>
                  </div>
                  <h2 className="text-4xl font-black tracking-[-0.06em] text-[#10261d] sm:text-5xl">{supportDisplayName}</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#38503d] sm:text-base">
                    Support runs like a live Discord room here: mirrored replies, shared file drops, and thread memory staying visible while you work.
                  </p>
                </div>
                <div className="mx-5 mb-6 flex items-center gap-3 rounded-[24px] border border-[#183324]/12 bg-[rgba(251,249,242,0.72)] px-4 py-3 shadow-[0_24px_60px_rgba(16,38,29,0.08)] sm:mx-8">
                  <Avatar profile={session?.ownerProfile ?? null} tone="support" />
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d775e]">Discord Identity</div>
                    <div className="mt-1 text-sm font-semibold text-[#10261d]">{discordUserId ?? 'Not linked'}</div>
                  </div>
                </div>
              </div>
            </section>

            <SignedOut>
              <div className="mt-6 flex min-h-[420px] items-center justify-center px-6">
                <div className="max-w-md rounded-[28px] border border-[#183324]/10 bg-white/80 p-8 text-center shadow-[0_20px_50px_rgba(16,38,29,0.08)]">
                  <Lock className="mx-auto h-8 w-8 text-[#56763c]" />
                  <h3 className="mt-4 text-xl font-bold text-[#10261d]">Sign in with Clerk</h3>
                  <p className="mt-2 text-sm text-[#5b6550]">This support area requires your Discord-linked Clerk account.</p>
                  <SignInButton>
                    <Button className="mt-6 rounded-2xl border-0 px-5 text-xs font-bold tracking-[0.18em] text-[#0f170f]" style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}>
                      Sign In
                    </Button>
                  </SignInButton>
                </div>
              </div>
            </SignedOut>

            <SignedIn>
              <div className="mt-6 flex flex-col">
                {!discordUserId && !loading && (
                  <div className="mb-4 flex items-center gap-3 rounded-[22px] border border-[#b45309]/20 bg-[rgba(180,83,9,0.08)] px-4 py-3 text-sm text-[#92400e]">
                    <ShieldAlert className="h-4 w-4" />
                    Link Discord in Clerk before using support chat.
                  </div>
                )}

                {!!session?.requiresDiscordJoin && (
                  <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-[#d48c2e]/20 bg-[rgba(243,169,95,0.10)] px-4 py-4 text-sm text-[#8b5a20] sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <LifeBuoy className="mt-0.5 h-4 w-4" />
                      <div>
                        <div className="font-semibold text-[#8b5a20]">Join the Hayashi Discord before sending support messages.</div>
                        <div className="mt-1 text-[#9a6a32]">
                          The composer stays locked until your Discord account shares a server with the bot.
                        </div>
                      </div>
                    </div>
                    {session.joinDiscordUrl && (
                      <Button
                        asChild
                        className="rounded-2xl border-0 px-4 text-xs font-bold tracking-[0.16em] text-[#0f170f]"
                        style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                      >
                        <a href={session.joinDiscordUrl} target="_blank" rel="noreferrer">JOIN DISCORD</a>
                      </Button>
                    )}
                  </div>
                )}

                {(!!session?.requiresTermsAcceptance || !!session?.requiresPrivacyAcceptance) && (
                  <div className="mb-4 flex flex-col gap-4 rounded-[24px] border border-[#183324]/12 bg-[rgba(255,247,231,0.88)] px-4 py-4 text-sm text-[#38503d]">
                    <div>
                      <div className="font-semibold text-[#10261d]">Accept the required policies before using support.</div>
                      <div className="mt-1 text-[#5d5645]">
                        We only unlock Discord-linked support after Terms of Service and Privacy Policy acceptance has been recorded for your Clerk-linked Discord account.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() => navigatePolicy('terms')}
                        variant="outline"
                        className="rounded-2xl border-[#183324]/12 bg-white/70 text-xs font-bold tracking-[0.16em] text-[#294232]"
                      >
                        Terms of Service
                      </Button>
                      <Button
                        onClick={() => navigatePolicy('privacy')}
                        variant="outline"
                        className="rounded-2xl border-[#183324]/12 bg-white/70 text-xs font-bold tracking-[0.16em] text-[#294232]"
                      >
                        Privacy Policy
                      </Button>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mb-4 flex items-center gap-3 rounded-[22px] border border-[#b45309]/20 bg-[rgba(180,83,9,0.08)] px-4 py-3 text-sm text-[#92400e]">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                  </div>
                )}

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <section className="flex min-h-[560px] flex-col overflow-hidden rounded-[30px] border border-[#183324]/10 bg-[rgba(255,252,245,0.88)] shadow-[0_28px_64px_rgba(16,38,29,0.08)]">
                    <div className="flex items-center justify-between gap-4 border-b border-[#183324]/10 bg-[rgba(248,243,231,0.85)] px-5 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar profile={activeThread?.ownerProfile ?? session?.ownerProfile ?? null} tone="support" />
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d775e]">Active Thread</div>
                          <div className="mt-1 truncate text-lg font-bold text-[#10261d]">{activeThread?.ownerProfile.displayName ?? supportDisplayName}</div>
                        </div>
                      </div>
                      {isOwner && activeThread && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={blocking}
                          onClick={handleBlock}
                          className="rounded-full border-[#b45309]/20 bg-[rgba(180,83,9,0.08)] text-[#92400e] hover:bg-[rgba(180,83,9,0.14)]"
                        >
                          <Ban className="mr-1.5 h-3.5 w-3.5" /> Block user
                        </Button>
                      )}
                    </div>

                    <ScrollArea className="flex-1 bg-[linear-gradient(180deg,rgba(255,252,245,0.94),rgba(249,242,228,0.92))]">
                      <div className="px-5 py-5">
                        {activeThread ? (
                          <div className="space-y-6">
                            {activeThread.messages.map((message) => (
                              <SupportMessageRow key={message.id} message={message} thread={activeThread} />
                            ))}
                          </div>
                        ) : !loading ? (
                          <div className="rounded-[24px] border border-dashed border-[#183324]/14 bg-[rgba(243,236,215,0.46)] p-5 text-sm text-[#4d5c47]">
                            Open a thread from the archive or start a new support request below.
                          </div>
                        ) : null}
                      </div>
                    </ScrollArea>

                    <div className="border-t border-[#183324]/10 bg-[rgba(251,249,242,0.96)] p-4">
                      {activeThread ? (
                        <div className="rounded-[24px] border border-[#183324]/10 bg-[rgba(255,252,245,0.98)] p-3 shadow-[0_14px_34px_rgba(16,38,29,0.06)]">
                          <PendingFiles files={composerFiles} onRemove={(index) => setComposerFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))} />
                          <div className="flex items-end gap-3">
                            <button
                              type="button"
                              onClick={() => composerFileInputRef.current?.click()}
                              disabled={supportLocked || sending || (!!activeThread.blockedAt && !isOwner)}
                              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-[#183324]/10 bg-[#f8f3e7] text-[#8b5a20] transition hover:border-[#d48c2e]/28 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Paperclip className="h-4 w-4" />
                            </button>
                            <input
                              ref={composerFileInputRef}
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(event) => appendFiles(event.target.files, 'composer')}
                            />
                            <textarea
                              value={composer}
                              onChange={(event) => setComposer(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault();
                                  void handleSend();
                                }
                              }}
                              disabled={supportLocked || sending || (!!activeThread.blockedAt && !isOwner)}
                              placeholder={
                                session?.requiresDiscordJoin
                                  ? 'Join Discord first to unlock support messaging.'
                                  : session?.requiresTermsAcceptance || session?.requiresPrivacyAcceptance
                                    ? 'Accept Terms and Privacy first to unlock support messaging.'
                                    : activeThread.blockedAt && !isOwner
                                      ? 'This thread has been blocked.'
                                      : 'Message support, drop files, or paste a GIF link...'
                              }
                              className="min-h-[64px] flex-1 resize-none bg-transparent px-1 py-2 text-sm text-[#10261d] outline-none placeholder:text-[#6d775e]"
                            />
                            <Button
                              onClick={() => void handleSend()}
                              disabled={supportLocked || sending || (!composer.trim() && composerFiles.length === 0) || (!!activeThread.blockedAt && !isOwner)}
                              className="h-12 rounded-2xl border-0 px-4 text-xs font-bold tracking-[0.16em] text-[#0f170f]"
                              style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-[#183324]/10 bg-[rgba(255,252,245,0.98)] p-3 shadow-[0_14px_34px_rgba(16,38,29,0.06)]">
                          <PendingFiles files={newThreadFiles} onRemove={(index) => setNewThreadFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))} />
                          <div className="flex items-end gap-3">
                            <button
                              type="button"
                              onClick={() => newThreadFileInputRef.current?.click()}
                              disabled={supportLocked || sending || !discordUserId}
                              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-[#183324]/10 bg-[#f8f3e7] text-[#8b5a20] transition hover:border-[#d48c2e]/28 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Paperclip className="h-4 w-4" />
                            </button>
                            <input
                              ref={newThreadFileInputRef}
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(event) => appendFiles(event.target.files, 'thread')}
                            />
                            <textarea
                              value={newThreadText}
                              onChange={(event) => setNewThreadText(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault();
                                  void handleCreateThread();
                                }
                              }}
                              disabled={supportLocked || sending || !discordUserId}
                              placeholder={
                                session?.requiresDiscordJoin
                                  ? 'Join Discord first to unlock support messaging.'
                                  : session?.requiresTermsAcceptance || session?.requiresPrivacyAcceptance
                                    ? 'Accept Terms and Privacy first to unlock support messaging.'
                                    : 'Describe the issue, attach files, or paste a GIF link...'
                              }
                              className="min-h-[64px] flex-1 resize-none bg-transparent px-1 py-2 text-sm text-[#10261d] outline-none placeholder:text-[#6d775e]"
                            />
                            <Button
                              onClick={() => void handleCreateThread()}
                              disabled={supportLocked || sending || (!newThreadText.trim() && newThreadFiles.length === 0) || !discordUserId}
                              className="h-12 rounded-2xl border-0 px-4 text-xs font-bold tracking-[0.16em] text-[#0f170f]"
                              style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                            >
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  <aside className="rounded-[30px] border border-[#183324]/10 bg-[rgba(251,249,242,0.84)] p-5 shadow-[0_28px_64px_rgba(16,38,29,0.06)]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d775e]">Thread Context</div>
                    <div className="mt-3 text-sm leading-6 text-[#38503d]">
                      {activeThread?.contextSummary ?? 'Azure-backed context fill will appear here once the thread has messages.'}
                    </div>

                    <div className="mt-5 space-y-3">
                      <div className="rounded-[22px] border border-[#183324]/10 bg-white/65 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Urgency</div>
                        <div className="mt-2 text-sm font-semibold text-[#10261d]">{activeThread?.contextJson?.urgency ?? 'normal'}</div>
                      </div>
                      <div className="rounded-[22px] border border-[#183324]/10 bg-white/65 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Sentiment</div>
                        <div className="mt-2 text-sm font-semibold text-[#10261d]">{activeThread?.contextJson?.sentiment ?? 'unknown'}</div>
                      </div>
                      <div className="rounded-[22px] border border-[#183324]/10 bg-white/65 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Open Issues</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(activeThread?.contextJson?.issues ?? []).map((issue) => (
                            <Badge key={issue} variant="outline" className="rounded-full border-[#183324]/12 bg-[#f3ecd7] text-[10px] text-[#56763c]">{issue}</Badge>
                          ))}
                          {!(activeThread?.contextJson?.issues ?? []).length && (
                            <span className="text-xs text-[#6d775e]">No extracted issues yet.</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-[22px] border border-[#183324]/10 bg-white/65 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Next Step</div>
                        <div className="mt-2 text-sm text-[#38503d]">{activeThread?.contextJson?.nextStep ?? 'Pending support analysis.'}</div>
                      </div>
                      {activeThread?.blockedAt && (
                        <div className="rounded-[22px] border border-[#b45309]/18 bg-[rgba(180,83,9,0.08)] p-4 text-sm text-[#92400e]">
                          Blocked: {activeThread.blockedReason ?? 'Rude or confrontational behavior'}
                        </div>
                      )}
                    </div>
                  </aside>
                </div>
              </div>
            </SignedIn>
          </div>
        </main>
      </div>
    </div>
  );
}
