import { useState } from 'react';
import { X, AlertCircle, Zap, Sparkles, Code2 } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { apiFetch } from '@/lib/http';

interface BillingModalProps {
  token: string | null;
}

const PLANS = [
  {
    id: 'creator',
    name: 'Creator',
    price: '$29.99',
    period: '/month',
    icon: Sparkles,
    color: '#5ac8fa',
    features: ['Unlimited plugin generations', 'Browser playback', '5–10 VST exports/month'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$99.99',
    period: '/month',
    icon: Zap,
    color: '#ff8c61',
    features: ['Unlimited plugin generations', '20 VST + CLAP exports/month', 'Audio feature extraction'],
  },
  {
    id: 'studio',
    name: 'Studio',
    price: '$299.99',
    period: '/month',
    icon: Code2,
    color: '#a78bfa',
    features: ['API access (usage-based)', 'Unlimited VST + CLAP exports', 'Dedicated compute (coming soon)'],
  },
];

export function BillingModal({ token }: BillingModalProps) {
  const billing = useProjectStore((s) => s.billing);
  const closePaywall = useProjectStore((s) => s.closePaywall);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!billing.paywallOpen) return null;

  const currentPlan = billing.snapshot?.plan ?? 'free';

  const handleUpgrade = async (planId: string) => {
    setError(null);
    if (!token) {
      setError('Not authenticated. Please sign in.');
      return;
    }
    setPending(planId);
    try {
      const res = await apiFetch(`${import.meta.env.VITE_SERVER_BASE_URL ?? ''}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: planId }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
      } else {
        setError(body.error ?? 'Checkout failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
      <section
        className="w-full max-w-2xl p-6"
        style={{
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: '#525252' }}>Hayashi Plugins</p>
            <h2 className="mt-1 text-xl font-bold" style={{ color: '#e5e5e5' }}>Upgrade your plan</h2>
          </div>
          <button
            className="rounded-md p-1 transition-colors hover:bg-white/5"
            type="button"
            onClick={closePaywall}
            aria-label="Close paywall"
          >
            <X size={16} style={{ color: '#737373' }} />
          </button>
        </div>

        {billing.paywallMessage && (
          <div className="mb-4 rounded-lg p-3 text-xs" style={{ background: 'rgba(255,140,97,0.08)', color: '#ff8c61', border: '1px solid rgba(255,140,97,0.2)' }}>
            {billing.paywallMessage}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl p-4"
              style={{
                border: currentPlan === plan.id ? `1px solid ${plan.color}` : '1px solid rgba(255,255,255,0.06)',
                background: currentPlan === plan.id ? `${plan.color}08` : '#111111',
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${plan.color}20`, color: plan.color }}>
                  <plan.icon size={14} />
                </div>
                <span className="text-sm font-bold" style={{ color: '#e5e5e5' }}>{plan.name}</span>
              </div>
              <div className="mb-3">
                <span className="text-lg font-bold" style={{ color: '#e5e5e5' }}>{plan.price}</span>
                <span className="text-xs" style={{ color: '#525252' }}>{plan.period}</span>
              </div>
              <ul className="mb-4 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="text-[11px]" style={{ color: '#737373' }}>{f}</li>
                ))}
              </ul>
              {currentPlan === plan.id ? (
                <button disabled className="w-full rounded-lg py-2 text-xs font-bold" style={{ background: `${plan.color}20`, color: plan.color }}>Current Plan</button>
              ) : (
                <button
                  className="w-full rounded-lg py-2 text-xs font-bold transition-opacity hover:opacity-90"
                  style={{ background: plan.color, color: '#0a0a0a' }}
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={pending !== null}
                >
                  {pending === plan.id ? 'Loading...' : 'Upgrade'}
                </button>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg p-3 text-xs" style={{ background: 'rgba(255,59,48,0.08)', color: '#ff3b30', border: '1px solid rgba(255,59,48,0.2)' }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </section>
    </div>
  );
}
