import { SignedIn, SignedOut, SignInButton, UserButton, useAuth, useUser } from '@clerk/clerk-react';
import { ArrowLeft, CheckCircle2, Crown, FileBadge2, LifeBuoy, Lock, ScrollText, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PluginLibrary } from './PluginLibrary';
import { usePluginStore } from '@/stores/pluginStore';
import { buildPluginPath } from '@/lib/pluginRoutes';
import { useClerkToken } from '@/hooks/useClerkToken';
import { acceptOnboardingPolicy, loadOnboardingStatus, type OnboardingStatus } from '@/lib/onboarding';

const POLICY_COPY = {
  terms: {
    title: 'Terms of Service',
    shortTitle: 'Terms',
    kicker: 'Use of Hayashi',
    icon: ScrollText,
    acceptLabel: 'I Agree to the Terms',
    intro: 'These terms govern your access to Hayashi, including plugin generation, exports, support workflows, Discord-based onboarding, and any associated hosted services.',
    sections: [
      {
        heading: '1. Account and identity',
        body: 'You must use a valid Clerk account and link the Discord account you intend to use for community access and support. You are responsible for activity that occurs under your account and for keeping your connected identity accurate.',
      },
      {
        heading: '2. Acceptable use',
        body: 'You may not use Hayashi to generate abusive, infringing, malicious, deceptive, or unlawful content. You may not interfere with the platform, bypass limits, scrape private data, or use support channels to harass staff or other users.',
      },
      {
        heading: '3. Generated output',
        body: 'Hayashi provides generated code, UI, assets, exports, and analysis outputs on an as-is basis. You are responsible for reviewing generated content before shipping, redistributing, or relying on it in production workflows.',
      },
      {
        heading: '4. Billing and usage',
        body: 'Paid plans unlock higher export and compute limits. Charges, renewals, and subscription changes are handled through the configured billing provider. Usage ceilings, export quotas, and support access can change by plan tier.',
      },
      {
        heading: '5. Support and moderation',
        body: 'Support access may require Discord membership, policy acceptance, and role verification. Harassing, rude, or confrontational behavior can result in support access being blocked or your onboarding being revoked.',
      },
      {
        heading: '6. Suspension and termination',
        body: 'We may suspend or terminate access if you violate these terms, abuse the platform, create legal or security risk, or materially disrupt service operations. Certain account records may be retained as required for billing, fraud prevention, or compliance.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    shortTitle: 'Privacy',
    kicker: 'Data and handling',
    icon: ShieldCheck,
    acceptLabel: 'I Accept the Privacy Policy',
    intro: 'This policy explains what information Hayashi processes in the product, support flow, and Discord onboarding path, and how that information is used to operate the service.',
    sections: [
      {
        heading: '1. Information we collect',
        body: 'We may collect account identifiers, linked Discord identity, prompts, generated plugin data, build logs, support thread content, billing state, and operational telemetry needed to run the service and troubleshoot issues.',
      },
      {
        heading: '2. How information is used',
        body: 'We use this information to authenticate users, generate plugins, process exports, provide support, summarize thread context, enforce product limits, prevent abuse, and improve platform reliability.',
      },
      {
        heading: '3. Discord onboarding and support',
        body: 'When you use Discord-linked onboarding or support, we may store your Discord user id, support thread metadata, mirrored support messages, policy acceptance timestamps, and verification role state needed to manage access.',
      },
      {
        heading: '4. Third-party processors',
        body: 'Hayashi may rely on third-party services for authentication, payments, hosting, AI inference, storage, build execution, and community messaging. Those providers process data according to their own terms and privacy practices.',
      },
      {
        heading: '5. Retention and security',
        body: 'We retain information for as long as needed to operate the product, maintain billing and support records, prevent fraud, and satisfy legal obligations. We apply reasonable technical and operational safeguards, but no system is guaranteed to be risk-free.',
      },
      {
        heading: '6. Your choices',
        body: 'You can control whether to link Discord, whether to subscribe to paid plans, and whether to continue using the platform. Some features, including support access, may be unavailable unless you provide the linked identity and accept the required policies.',
      },
    ],
  },
} as const;

function readUserIdParam() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('userId');
}

function getDiscordUserId(user: unknown): string | null {
  const externalAccounts = (user as { externalAccounts?: Array<{ provider?: string; providerUserId?: string }> } | null)?.externalAccounts ?? [];
  const account = externalAccounts.find((item) => item.provider === 'discord' || item.provider === 'oauth_discord');
  return account?.providerUserId ?? null;
}

export function PolicyPage({ policy }: { policy: 'terms' | 'privacy' }) {
  const { getToken } = useClerkToken();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const activePlugin = usePluginStore((s) => s.plugins.find((p) => p.id === s.activePluginId));
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryUserId = useMemo(() => readUserIdParam(), []);
  const discordUserId = getDiscordUserId(user);
  const effectiveDiscordUserId = discordUserId ?? queryUserId ?? null;
  const copy = POLICY_COPY[policy];
  const Icon = copy.icon;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isLoaded) return;
      if (!isSignedIn) {
        setLoading(false);
        return;
      }
      if (!effectiveDiscordUserId) {
        setLoading(false);
        return;
      }
      try {
        const token = await getToken();
        if (!token) {
          setError('Waiting for authenticated session...');
          setLoading(false);
          return;
        }
        const next = await loadOnboardingStatus(token, effectiveDiscordUserId);
        if (!cancelled) setStatus(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load onboarding status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveDiscordUserId, getToken, isLoaded, isSignedIn]);

  const acceptedAt = policy === 'terms' ? status?.termsAcceptedAt : status?.privacyAcceptedAt;

  async function acceptPolicy() {
    if (!effectiveDiscordUserId) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError('Waiting for authenticated session...');
        return;
      }
      const next = await acceptOnboardingPolicy(token, effectiveDiscordUserId, policy);
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept policy');
    } finally {
      setSaving(false);
    }
  }

  function navigateHome() {
    const target = queryUserId ? `/?userId=${encodeURIComponent(queryUserId)}` : '/';
    window.location.href = target;
  }

  function navigateWorkspace() {
    if (!activePlugin) return;
    window.location.href = buildPluginPath(activePlugin.id, activePlugin.name);
  }

  function navigateSupport() {
    const params = new URLSearchParams();
    if (effectiveDiscordUserId) params.set('userId', effectiveDiscordUserId);
    const query = params.toString();
    window.location.href = query ? `/chat?${query}` : '/chat';
  }

  function navigatePricing() {
    const params = new URLSearchParams();
    if (user?.id) params.set('userId', user.id);
    const query = params.toString();
    window.location.href = query ? `/pricing?${query}` : '/pricing';
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
          <Button variant="ghost" size="sm" className="h-8 rounded-md text-xs font-medium text-[#737373] hover:bg-white/5 hover:text-[#e5e5e5]" onClick={navigateWorkspace} disabled={!activePlugin}>Workspace</Button>
          <Button variant="ghost" size="sm" className="h-8 rounded-md text-xs font-medium text-[#737373] hover:bg-white/5 hover:text-[#e5e5e5]" onClick={navigateSupport}>Support</Button>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-md border-[#d48c2e]/30 bg-[#fff7e8] px-3 text-[11px] text-[#a05b1d] hover:bg-[#d48c2e]/10" onClick={navigatePricing}>
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
        <PluginLibrary />
        <main className="hayashi-scroll flex-1 overflow-auto bg-[#f4efdf]">
          <div className="mx-auto max-w-[1480px] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
            <section className="overflow-hidden rounded-[36px] border border-[#183324]/12 bg-[linear-gradient(135deg,rgba(255,247,231,0.95)_0%,rgba(243,236,215,0.96)_48%,rgba(231,245,221,0.92)_100%)] shadow-[0_30px_80px_rgba(16,38,29,0.10)]">
              <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-10">
                <div>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="h-7 rounded-full border-[#183324]/14 bg-white/55 px-3 text-[11px] font-semibold text-[#294232]">
                      <Icon className="mr-1.5 h-3.5 w-3.5" /> {copy.kicker}
                    </Badge>
                    {acceptedAt && (
                      <Badge variant="outline" className="h-7 rounded-full border-[#34c759]/20 bg-white/70 px-3 text-[11px] font-semibold text-[#2f7b4e]">
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Accepted
                      </Badge>
                    )}
                  </div>
                  <h1 className="text-4xl font-black tracking-[-0.06em] text-[#10261d] sm:text-5xl lg:text-6xl">{copy.title}</h1>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[#38503d] sm:text-base">{copy.intro}</p>
                </div>
                <div className="rounded-[28px] border border-[#183324]/10 bg-[rgba(251,249,242,0.78)] p-5 shadow-[0_20px_50px_rgba(16,38,29,0.08)]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d775e]">Onboarding status</div>
                  <div className="mt-3 space-y-3 text-sm text-[#38503d]">
                    <div className="rounded-[20px] border border-[#183324]/10 bg-white/65 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Discord</div>
                      <div className="mt-1 font-semibold text-[#10261d]">{effectiveDiscordUserId ?? 'Not linked'}</div>
                    </div>
                    <div className="rounded-[20px] border border-[#183324]/10 bg-white/65 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Guild access</div>
                      <div className="mt-1 font-semibold text-[#10261d]">{status?.inGuild ? 'Joined' : 'Pending join'}</div>
                    </div>
                    <div className="rounded-[20px] border border-[#183324]/10 bg-white/65 px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Support</div>
                      <div className="mt-1 font-semibold text-[#10261d]">{status?.canAccessSupport ? 'Unlocked' : 'Locked'}</div>
                    </div>
                  </div>
                  {status?.joinDiscordUrl && !status.inGuild && (
                    <Button asChild className="mt-5 rounded-2xl border-0 px-4 text-xs font-bold tracking-[0.16em] text-[#0f170f]" style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}>
                      <a href={status.joinDiscordUrl} target="_blank" rel="noreferrer">JOIN DISCORD</a>
                    </Button>
                  )}
                </div>
              </div>
            </section>

            <SignedOut>
              <div className="mt-6 rounded-[28px] border border-[#183324]/12 bg-white/80 p-8 text-center shadow-[0_20px_50px_rgba(16,38,29,0.08)]">
                <Lock className="mx-auto h-8 w-8 text-[#56763c]" />
                <h2 className="mt-4 text-2xl font-bold text-[#10261d]">Sign in to continue</h2>
                <p className="mt-2 text-sm text-[#5b6550]">These policy pages require your Discord-linked Clerk account.</p>
              </div>
            </SignedOut>

            <SignedIn>
              {!effectiveDiscordUserId && !loading && (
                <div className="mt-6 rounded-[24px] border border-[#b45309]/20 bg-[rgba(180,83,9,0.08)] px-4 py-4 text-sm text-[#92400e]">
                  Link your Discord account in Clerk before continuing with onboarding.
                </div>
              )}

              {error && (
                <div className="mt-6 rounded-[24px] border border-[#b45309]/20 bg-[rgba(180,83,9,0.08)] px-4 py-4 text-sm text-[#92400e]">
                  {error}
                </div>
              )}

              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <section className="rounded-[30px] border border-[#183324]/10 bg-[rgba(255,255,255,0.74)] p-6 shadow-[0_28px_64px_rgba(16,38,29,0.08)]">
                  <div className="mb-5 flex items-center gap-3">
                    <button type="button" onClick={navigateSupport} className="inline-flex items-center gap-2 rounded-full border border-[#183324]/12 bg-white/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#38503d] shadow-[0_10px_24px_rgba(16,38,29,0.06)]">
                      <ArrowLeft className="h-3.5 w-3.5" /> Back to Support
                    </button>
                    <div className="flex-1" />
                    <Badge variant="outline" className="rounded-full border-[#183324]/14 bg-white/55 px-3 py-1 text-[11px] font-semibold text-[#294232]">
                      userId={effectiveDiscordUserId ?? 'unknown'}
                    </Badge>
                  </div>
                  <div className="space-y-5">
                    {copy.sections.map((section) => (
                      <article key={section.heading} className="rounded-[24px] border border-[#183324]/8 bg-white/60 px-5 py-5">
                        <h2 className="text-lg font-black tracking-[-0.03em] text-[#10261d]">{section.heading}</h2>
                        <p className="mt-3 text-sm leading-7 text-[#38503d]">{section.body}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <aside className="rounded-[30px] border border-[#183324]/10 bg-[rgba(251,249,242,0.84)] p-5 shadow-[0_28px_64px_rgba(16,38,29,0.06)]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d775e]">Acceptance</div>
                  <p className="mt-3 text-sm leading-6 text-[#38503d]">
                    Accept both documents to receive the onboarding roles and unlock support messaging through the Discord-linked support flow.
                  </p>
                  <div className="mt-5 space-y-3">
                    <div className="rounded-[22px] border border-[#183324]/10 bg-white/65 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Terms</div>
                      <div className="mt-2 text-sm font-semibold text-[#10261d]">{status?.termsAcceptedAt ? 'Accepted' : 'Pending'}</div>
                    </div>
                    <div className="rounded-[22px] border border-[#183324]/10 bg-white/65 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Privacy</div>
                      <div className="mt-2 text-sm font-semibold text-[#10261d]">{status?.privacyAcceptedAt ? 'Accepted' : 'Pending'}</div>
                    </div>
                    <div className="rounded-[22px] border border-[#183324]/10 bg-white/65 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d876d]">Verified member</div>
                      <div className="mt-2 text-sm font-semibold text-[#10261d]">{status?.verifiedRoleAssignedAt ? 'Assigned' : 'Pending'}</div>
                    </div>
                  </div>
                  <Button
                    onClick={() => void acceptPolicy()}
                    disabled={loading || saving || !effectiveDiscordUserId || !!acceptedAt}
                    className="mt-6 h-12 w-full rounded-2xl border-0 text-xs font-bold tracking-[0.16em] text-[#0f170f]"
                    style={{ background: acceptedAt ? 'rgba(16,38,29,0.10)' : 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                  >
                    {acceptedAt ? 'ALREADY ACCEPTED' : saving ? 'SAVING...' : copy.acceptLabel.toUpperCase()}
                  </Button>
                  {status?.canAccessSupport && (
                    <Button onClick={navigateSupport} variant="outline" className="mt-3 h-11 w-full rounded-2xl border-[#183324]/12 bg-white/70 text-xs font-bold tracking-[0.16em] text-[#294232]">
                      <LifeBuoy className="mr-1.5 h-3.5 w-3.5" /> Open Support
                    </Button>
                  )}
                  <div className="mt-4 rounded-[22px] border border-[#183324]/10 bg-[rgba(243,236,215,0.56)] p-4 text-xs leading-6 text-[#5d5645]">
                    <FileBadge2 className="mb-2 h-4 w-4 text-[#d48c2e]" />
                    Acceptance is recorded against your Clerk-linked Discord identity and used to issue the required onboarding roles.
                  </div>
                </aside>
              </div>
            </SignedIn>
          </div>
        </main>
      </div>
    </div>
  );
}
