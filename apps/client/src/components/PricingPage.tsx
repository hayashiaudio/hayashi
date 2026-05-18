import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Crown, Lock, Sparkles, Code2, ArrowLeft, Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { bootstrapBilling } from '@/lib/api';
import { apiFetch } from '@/lib/http';
import { useClerkToken } from '@/hooks/useClerkToken';
import { PluginLibrary } from './PluginLibrary';
import { usePluginStore } from '@/stores/pluginStore';
import { buildPluginPath } from '@/lib/pluginRoutes';

const PLANS: Array<{
  id: 'creator' | 'pro' | 'studio';
  name: string;
  price: string;
  period: string;
  icon: typeof Sparkles;
  color: string;
  description: string;
  features: string[];
  recommended?: boolean;
}> = [
  {
    id: 'creator',
    name: 'Creator',
    price: '$29.99',
    period: '/month',
    icon: Sparkles,
    color: '#5ac8fa',
    description: 'For regular patch shipping and fast iteration.',
    features: ['Unlimited plugin generations', 'Browser playback', '5-10 VST exports / month'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$99.99',
    period: '/month',
    icon: Crown,
    color: '#d48c2e',
    description: 'For serious builders exporting polished production bundles.',
    features: ['Unlimited plugin generations', '20 VST + CLAP exports / month', 'Audio feature extraction'],
    recommended: true,
  },
  {
    id: 'studio',
    name: 'Studio',
    price: '$299.99',
    period: '/month',
    icon: Code2,
    color: '#56763c',
    description: 'For teams and heavier support / compute needs.',
    features: ['API access (usage-based)', 'Unlimited VST + CLAP exports', 'Dedicated compute (coming soon)'],
  },
] as const;

const PLAN_CARD_STYLES: Record<'creator' | 'pro' | 'studio', {
  shell: string;
  border: string;
  glow: string;
  iconBg: string;
  text: string;
  muted: string;
  chip: string;
  button: string;
}> = {
  creator: {
    shell: 'linear-gradient(180deg, rgba(255,250,242,0.96) 0%, rgba(247,239,224,0.98) 100%)',
    border: 'rgba(90,200,250,0.18)',
    glow: '0 22px 48px rgba(16,38,29,0.08)',
    iconBg: 'rgba(90,200,250,0.12)',
    text: '#10261d',
    muted: '#4f645c',
    chip: 'rgba(90,200,250,0.10)',
    button: 'linear-gradient(135deg, #67d8ff 0%, #2eaadc 100%)',
  },
  pro: {
    shell: 'linear-gradient(180deg, rgba(255,245,230,0.98) 0%, rgba(247,232,205,0.98) 100%)',
    border: 'rgba(212,140,46,0.28)',
    glow: '0 24px 56px rgba(87,54,17,0.10)',
    iconBg: 'rgba(243,169,95,0.16)',
    text: '#10261d',
    muted: '#5d5645',
    chip: 'rgba(243,169,95,0.16)',
    button: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)',
  },
  studio: {
    shell: 'linear-gradient(180deg, rgba(252,245,238,0.98) 0%, rgba(243,232,223,0.98) 100%)',
    border: 'rgba(255,140,97,0.22)',
    glow: '0 22px 52px rgba(73,31,22,0.08)',
    iconBg: 'rgba(255,140,97,0.12)',
    text: '#10261d',
    muted: '#67564d',
    chip: 'rgba(255,140,97,0.12)',
    button: 'linear-gradient(135deg, #ff8c61 0%, #ff5f6d 100%)',
  },
};

function readUserIdParam() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('userId');
}

function getDiscordUserId(user: unknown): string | null {
  const externalAccounts = (user as { externalAccounts?: Array<{ provider?: string; providerUserId?: string }> } | null)?.externalAccounts ?? [];
  const account = externalAccounts.find((item) => item.provider === 'discord' || item.provider === 'oauth_discord');
  return account?.providerUserId ?? null;
}

export function PricingPage() {
  const { getToken } = useClerkToken();
  const { user } = useUser();
  const activePlugin = usePluginStore((s) => s.plugins.find((p) => p.id === s.activePluginId));
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryUserId = useMemo(() => readUserIdParam(), []);
  const effectiveUserId = user?.id ?? queryUserId ?? 'guest';
  const discordUserId = getDiscordUserId(user);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const snapshot = await bootstrapBilling(token);
        if (!cancelled) setCurrentPlan(snapshot.plan ?? 'free');
      } catch {
        // non-blocking
      }
    })();

    return () => { cancelled = true; };
  }, [getToken]);

  async function openCheckout(planId: string) {
    setError(null);
    setPendingPlan(planId);
    try {
      const token = await getToken();
      if (!token) {
        setError('Sign in to upgrade.');
        return;
      }

      const res = await apiFetch(`${import.meta.env.VITE_SERVER_BASE_URL ?? ''}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.checkoutUrl) {
        setError(body.error ?? 'Checkout failed');
        return;
      }
      window.location.href = body.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setPendingPlan(null);
    }
  }

  function goBack() {
    const target = queryUserId ? `/?userId=${encodeURIComponent(queryUserId)}` : '/';
    window.location.href = target;
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
    if (discordUserId) params.set('userId', discordUserId);
    const query = params.toString();
    window.location.href = query ? `/chat?${query}` : '/chat';
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
            className="h-8 rounded-md text-xs font-medium text-[#737373] hover:bg-white/5 hover:text-[#e5e5e5]"
            onClick={navigateSupport}
          >
            Support
          </Button>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-md border-[#d48c2e]/30 bg-[#fff7e8] px-3 text-[11px] text-[#a05b1d] hover:bg-[#d48c2e]/10">
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
        <main className="hayashi-scroll flex-1 overflow-auto">
          <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center gap-3">
          <button type="button" onClick={goBack} className="inline-flex items-center gap-2 rounded-full border border-[#183324]/12 bg-white/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#38503d] shadow-[0_10px_24px_rgba(16,38,29,0.06)]">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex-1" />
          <Badge variant="outline" className="rounded-full border-[#183324]/14 bg-white/55 px-3 py-1 text-[11px] font-semibold text-[#294232]">
            Clerk user: {effectiveUserId}
          </Badge>
        </header>

        <section className="overflow-hidden rounded-[36px] border border-[#183324]/12 bg-[linear-gradient(135deg,rgba(255,247,231,0.95)_0%,rgba(243,236,215,0.96)_48%,rgba(231,245,221,0.92)_100%)] shadow-[0_30px_80px_rgba(16,38,29,0.10)]">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-10">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-7 rounded-full border-[#183324]/14 bg-white/55 px-3 text-[11px] font-semibold text-[#294232] shadow-[0_8px_20px_rgba(16,38,29,0.06)]">
                  <Crown className="mr-1.5 h-3.5 w-3.5" /> Upgrade Hayashi
                </Badge>
                <Badge variant="outline" className="h-7 rounded-full border-[#183324]/14 bg-[#f3ecd7] px-3 text-[11px] font-semibold text-[#56763c] shadow-[0_8px_20px_rgba(16,38,29,0.04)]">
                  Stripe checkout
                </Badge>
              </div>
              <h1 className="text-4xl font-black tracking-[-0.06em] text-[#10261d] sm:text-5xl lg:text-6xl">
                Choose the
                <br />
                right build lane.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#38503d] sm:text-base">
                Plans are tuned for how often you generate, preview, and export plugins. Pick the tier that matches your build velocity, then jump straight into Stripe checkout.
              </p>
              {error && (
                <div className="mt-5 rounded-[22px] border border-[#b45309]/18 bg-[rgba(180,83,9,0.08)] px-4 py-3 text-sm text-[#92400e]">
                  {error}
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-[#183324]/10 bg-[rgba(251,249,242,0.8)] p-5 shadow-[0_20px_50px_rgba(16,38,29,0.08)]">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d775e]">Current access</div>
              <div className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#10261d]">{currentPlan.toUpperCase()}</div>
              <p className="mt-3 text-sm leading-6 text-[#4d5c47]">
                Upgrade to increase export volume, unlock higher-throughput workflows, and keep support / compute aligned with your actual usage.
              </p>
            </div>
          </div>
        </section>

        <SignedOut>
          <div className="mt-6 rounded-[28px] border border-[#183324]/12 bg-white/80 p-8 text-center shadow-[0_20px_50px_rgba(16,38,29,0.08)]">
            <Lock className="mx-auto h-8 w-8 text-[#56763c]" />
            <h2 className="mt-4 text-2xl font-bold text-[#10261d]">Sign in to upgrade</h2>
            <p className="mt-2 text-sm text-[#5b6550]">Checkout sessions require an authenticated Clerk account.</p>
            <SignInButton>
              <Button className="mt-6 rounded-2xl border-0 px-5 text-xs font-bold tracking-[0.18em] text-[#0f170f]" style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}>
                Sign In
              </Button>
            </SignInButton>
          </div>
        </SignedOut>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isCurrent = currentPlan === plan.id;
            const styles = PLAN_CARD_STYLES[plan.id];
            return (
              <section
                key={plan.id}
                className="relative flex h-full flex-col overflow-hidden rounded-[30px] border p-6"
                style={{
                  background: styles.shell,
                  borderColor: styles.border,
                  boxShadow: styles.glow,
                }}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.55),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.28),transparent_28%)] opacity-90" />
                {plan.recommended && (
                  <Badge variant="outline" className="absolute right-4 top-4 rounded-full border-[#d48c2e]/18 bg-white/60 text-[10px] uppercase tracking-[0.16em] text-[#a05b1d]">
                    Recommended
                  </Badge>
                )}
                <div className="relative z-10 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/5" style={{ background: styles.iconBg, color: plan.color }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-lg font-black tracking-[-0.03em]" style={{ color: styles.text }}>{plan.name}</div>
                    <div className="text-sm" style={{ color: styles.muted }}>{plan.description}</div>
                  </div>
                </div>
                <div className="relative z-10 mt-6 flex items-end gap-2">
                  <span className="text-4xl font-black tracking-[-0.05em]" style={{ color: styles.text }}>{plan.price}</span>
                  <span className="pb-1 text-sm" style={{ color: styles.muted }}>{plan.period}</span>
                </div>
                <ul className="relative z-10 mt-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm" style={{ color: styles.text }}>
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: plan.color }} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="relative z-10 mt-5 flex items-center gap-2">
                  <span className="rounded-full border border-black/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ background: styles.chip, color: styles.muted }}>
                    {plan.id === 'creator' ? 'Fast lane' : plan.id === 'pro' ? 'Best value' : 'Heavy compute'}
                  </span>
                </div>
                <Button
                  onClick={() => void openCheckout(plan.id)}
                  disabled={pendingPlan !== null || isCurrent}
                  className="relative z-10 mt-7 h-12 rounded-2xl border-0 text-xs font-bold tracking-[0.18em]"
                  style={{
                    background: isCurrent ? 'rgba(16,38,29,0.10)' : styles.button,
                    color: '#0f170f',
                  }}
                >
                  {isCurrent ? 'CURRENT PLAN' : pendingPlan === plan.id ? 'OPENING CHECKOUT...' : `UPGRADE TO ${plan.name.toUpperCase()}`}
                </Button>
              </section>
            );
          })}
        </div>

        <section className="mt-8 rounded-[30px] border border-[#183324]/10 bg-[linear-gradient(180deg,rgba(255,250,242,0.96)_0%,rgba(246,238,223,0.98)_100%)] p-6 text-[#10261d] shadow-[0_22px_48px_rgba(16,38,29,0.06)]">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d6a57]">Plan comparison</div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.16em] text-[#7d6a57]">
                  <th className="pb-2 pr-4">Capability</th>
                  <th className="pb-2 pr-4">Creator</th>
                  <th className="pb-2 pr-4">Pro</th>
                  <th className="pb-2">Studio</th>
                </tr>
              </thead>
              <tbody className="text-sm text-[#294232]">
                <tr>
                  <td className="rounded-l-2xl border-y border-l border-[#183324]/8 bg-white/58 px-4 py-3 font-semibold">Generations</td>
                  <td className="border-y border-[#183324]/8 bg-white/58 px-4 py-3">Unlimited</td>
                  <td className="border-y border-[#183324]/8 bg-white/58 px-4 py-3">Unlimited</td>
                  <td className="rounded-r-2xl border-y border-r border-[#183324]/8 bg-white/58 px-4 py-3">Unlimited</td>
                </tr>
                <tr>
                  <td className="rounded-l-2xl border-y border-l border-[#183324]/8 bg-white/58 px-4 py-3 font-semibold">Exports</td>
                  <td className="border-y border-[#183324]/8 bg-white/58 px-4 py-3">5-10 / month</td>
                  <td className="border-y border-[#183324]/8 bg-white/58 px-4 py-3">20 / month</td>
                  <td className="rounded-r-2xl border-y border-r border-[#183324]/8 bg-white/58 px-4 py-3">Unlimited</td>
                </tr>
                <tr>
                  <td className="rounded-l-2xl border-y border-l border-[#183324]/8 bg-white/58 px-4 py-3 font-semibold">Formats</td>
                  <td className="border-y border-[#183324]/8 bg-white/58 px-4 py-3">VST3</td>
                  <td className="border-y border-[#183324]/8 bg-white/58 px-4 py-3">VST3 + CLAP</td>
                  <td className="rounded-r-2xl border-y border-r border-[#183324]/8 bg-white/58 px-4 py-3">VST3 + CLAP</td>
                </tr>
                <tr>
                  <td className="rounded-l-2xl border-y border-l border-[#183324]/8 bg-white/58 px-4 py-3 font-semibold">Compute</td>
                  <td className="border-y border-[#183324]/8 bg-white/58 px-4 py-3">Shared</td>
                  <td className="border-y border-[#183324]/8 bg-white/58 px-4 py-3">Priority</td>
                  <td className="rounded-r-2xl border-y border-r border-[#183324]/8 bg-white/58 px-4 py-3">Dedicated path</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
          </div>
        </main>
      </div>
    </div>
  );
}
