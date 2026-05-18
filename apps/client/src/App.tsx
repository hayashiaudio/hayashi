import { ClerkProvider } from '@clerk/clerk-react';
import PluginGenerator from './components/PluginGenerator';
import { AuthGuard } from './components/AuthGuard';
import { SupportChatPage } from './components/SupportChatPage';
import { PricingPage } from './components/PricingPage';
import { PolicyPage } from './components/PolicyPage';
import { SharedPluginPage } from './components/SharedPluginPage';

import { SmokeTestPage } from './components/SmokeTestPage';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';

export default function App() {
  const isChatRoute = typeof window !== 'undefined' && window.location.pathname === '/chat';
  const isPricingRoute = typeof window !== 'undefined' && window.location.pathname === '/pricing';
  const isTermsRoute = typeof window !== 'undefined' && window.location.pathname === '/terms';
  const isPrivacyRoute = typeof window !== 'undefined' && window.location.pathname === '/privacy';
  const isShareRoute = typeof window !== 'undefined' && window.location.pathname === '/share';
  const isSmokeRoute = typeof window !== 'undefined' && window.location.pathname === '/smoke';

  if (isShareRoute) {
    return (
      <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
        <SharedPluginPage />
      </ClerkProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <AuthGuard>
        {isSmokeRoute ? (
          <SmokeTestPage />
        ) : isChatRoute ? (
          <SupportChatPage />
        ) : isPricingRoute ? (
          <PricingPage />
        ) : isTermsRoute ? (
          <PolicyPage policy="terms" />
        ) : isPrivacyRoute ? (
          <PolicyPage policy="privacy" />
        ) : (
          <PluginGenerator />
        )}
      </AuthGuard>
    </ClerkProvider>
  );
}
