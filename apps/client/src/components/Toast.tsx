import { useEffect, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { X, AlertTriangle, Info } from 'lucide-react';

export function Toast() {
  const toast = useProjectStore((s) => s.toast);
  const closeToast = useProjectStore((s) => s.closeToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (toast.open) {
      setVisible(true);
      const timer = window.setTimeout(() => {
        setVisible(false);
        window.setTimeout(closeToast, 300);
      }, 10000);
      return () => window.clearTimeout(timer);
    }
  }, [toast.open, closeToast]);

  if (!toast.open) return null;

  const isWarning = toast.severity === 'warning';
  const isError = toast.severity === 'error';

  const bg = isError
    ? 'rgba(199,91,91,0.95)'
    : isWarning
      ? 'rgba(232,132,60,0.95)'
      : 'rgba(15,15,26,0.92)';

  const border = isError
    ? 'rgba(199,91,91,0.5)'
    : isWarning
      ? 'rgba(232,132,60,0.5)'
      : 'rgba(250,248,245,0.12)';

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[9999] flex max-w-md -translate-x-1/2 items-start gap-3 rounded-xl px-5 py-4 shadow-2xl backdrop-blur-sm transition-all duration-300"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(12px)',
        color: '#faf8f5',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {isWarning || isError ? (
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      ) : (
        <Info size={18} className="mt-0.5 shrink-0" />
      )}
      <p className="text-sm leading-relaxed" style={{ color: '#faf8f5' }}>
        {toast.message}
      </p>
      <button
        onClick={() => {
          setVisible(false);
          window.setTimeout(closeToast, 300);
        }}
        className="mt-0.5 shrink-0 rounded-md p-1 transition-colors hover:bg-white/10"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
