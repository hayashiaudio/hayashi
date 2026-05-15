import { useEffect } from 'react';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { MarketingPage } from './pages/MarketingPage';
import PluginGenerator from './components/PluginGenerator';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';

function StandaloneRouter() {
  const { isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      const params = new URLSearchParams(window.location.search);
      if (params.has('studio')) {
        window.history.replaceState({}, '', '/');
      }
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('studio') !== userId) {
      window.history.replaceState({}, '', `/?studio=${userId}`);
    }
  }, [isSignedIn, userId]);

  if (!isSignedIn) return <MarketingPage />;
  return <PluginGenerator />;
}

export default function App() {
  const brandMode = new URLSearchParams(window.location.search).get('brand') === '1';

  if (brandMode) {
    return (
      <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
        <MarketingPage />
      </ClerkProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <StandaloneRouter />
    </ClerkProvider>
  );
}
