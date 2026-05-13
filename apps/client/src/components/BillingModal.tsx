import { useState } from 'react';
import { Crown, Lock, X } from 'lucide-react';
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

  if (!billing.paywallOpen) return null;

  const isUnlimited = billing.snapshot?.plan === 'unlimited';

  const handleUpgrade = async () => {
    if (!accessToken || !DISCORD_UNLIMITED_SKU_ID) return;
    setPending('checkout');
    try {
      const success = await startDiscordPurchase(DISCORD_UNLIMITED_SKU_ID);
      if (!success) {
        console.warn('[Hayashi] Purchase did not complete');
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
      <section className="hayashi-surface w-full max-w-lg p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="hayashi-mini-label">Hayashi Unlimited</p>
            <h2 className="text-2xl font-semibold">Keep building without caps</h2>
          </div>
          <button className="hayashi-icon-button" type="button" onClick={closePaywall} aria-label="Close paywall">
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 rounded-2xl border border-[rgba(16,38,29,0.08)] bg-[rgba(250,249,245,0.72)] p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(237,146,47,0.16)] text-[var(--hayashi-ember)]">
              {isUnlimited ? <Crown size={18} /> : <Lock size={18} />}
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--hayashi-ink)]">$25/mo</p>
              <p className="text-sm opacity-70">{billing.paywallMessage ?? 'Upgrade for unlimited servers, nodes, and exports.'}</p>
            </div>
          </div>

          <div className="grid gap-2 text-sm text-[rgba(16,38,29,0.78)]">
            <div>Unlimited server and DM installations</div>
            <div>Unlimited active nodes</div>
            <div>Unlimited daily exports</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {!isUnlimited && (
            <button className="hayashi-action" type="button" onClick={handleUpgrade} disabled={pending !== null || !accessToken}>
              <Crown size={15} />
              {pending === 'checkout' ? 'Opening checkout…' : 'Upgrade to Unlimited'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
