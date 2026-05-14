import { useState } from 'react';
import { Crown, Lock, X, AlertCircle } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { startDiscordPurchase } from '@/hooks/useDiscordSdk';
import { DISCORD_UNLIMITED_SKU_ID } from '@/lib/constants';

interface BillingModalProps {
  accessToken: string | null;
}

export function BillingModal({ accessToken }: BillingModalProps) {
  const billing = useProjectStore((s) => s.billing);
  const closePaywall = useProjectStore((s) => s.closePaywall);
  const [pending, setPending] = useState<'checkout' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!billing.paywallOpen) return null;

  const isUnlimited = billing.snapshot?.plan === 'unlimited';

  const handleUpgrade = async () => {
    setError(null);
    if (!accessToken) {
      setError('Not authenticated. Please restart the app from Discord.');
      return;
    }
    if (!DISCORD_UNLIMITED_SKU_ID) {
      setError('Purchase is not configured. Contact support.');
      console.warn('[Hayashi] DISCORD_UNLIMITED_SKU_ID is empty');
      return;
    }
    setPending('checkout');
    try {
      const success = await startDiscordPurchase(DISCORD_UNLIMITED_SKU_ID);
      if (!success) {
        setError('Purchase could not be started. Make sure you are running inside Discord.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
      <section
        className="w-full max-w-lg p-6"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(16, 38, 29, 0.08)',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Hayashi Unlimited</p>
            <h2 className="text-2xl font-semibold" style={{ color: '#1a1a1a' }}>Keep building without caps</h2>
          </div>
          <button
            className="rounded-md p-1 transition-colors hover:bg-black/5"
            type="button"
            onClick={closePaywall}
            aria-label="Close paywall"
          >
            <X size={16} style={{ color: '#666' }} />
          </button>
        </div>

        <div
          className="mb-5 rounded-2xl p-4"
          style={{
            border: '1px solid rgba(16, 38, 29, 0.08)',
            background: '#faf5eb',
          }}
        >
          <div className="mb-3 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-2xl"
              style={{ background: 'rgba(237,146,47,0.16)', color: '#d48c2e' }}
            >
              {isUnlimited ? <Crown size={18} /> : <Lock size={18} />}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>$49.99/mo</p>
              <p className="text-sm" style={{ color: '#555' }}>
                {billing.paywallMessage ?? 'Upgrade for unlimited servers, nodes, and exports.'}
              </p>
            </div>
          </div>

          <div className="grid gap-2 text-sm" style={{ color: '#555' }}>
            <div>Unlimited server and DM installations</div>
            <div>Unlimited active nodes</div>
            <div>Unlimited daily exports</div>
          </div>
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg p-3 text-sm" style={{ background: 'rgba(199,91,91,0.08)', color: '#b8563d', border: '1px solid rgba(184,86,61,0.2)' }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {!isUnlimited && (
            <button className="hayashi-action" type="button" onClick={handleUpgrade} disabled={pending !== null}>
              <Crown size={15} />
              {pending === 'checkout' ? 'Opening checkout…' : 'Upgrade to Unlimited'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
