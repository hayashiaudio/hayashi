import { useEffect, useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useSessionStore } from '@/stores/sessionStore';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { signOut } = useClerk();
  const [localLocked, setLocalLocked] = useState(false);
  const { locked, reason, lock } = useSessionStore();

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      console.warn('[Hayashi] Auth expired during operation:', e.detail);
      lock('Your Clerk session expired');
      setLocalLocked(true);
      // Give the UI a moment to show the lock state before signing out
      setTimeout(() => {
        signOut();
      }, 1500);
    };

    window.addEventListener('hayashi:auth-expired', handler as EventListener);
    return () => {
      window.removeEventListener('hayashi:auth-expired', handler as EventListener);
    };
  }, [lock, signOut]);

  if (locked || localLocked) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#0a0a0a] text-[#e5e5e5] font-mono">
        <div className="text-[#ff8c61] text-4xl font-bold mb-4">SESSION EXPIRED</div>
        <div className="text-sm text-[#737373] mb-8">{reason ?? 'Your session has expired. Signing you out...'}</div>
        <div className="w-48 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div className="h-full bg-[#ff8c61] animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
