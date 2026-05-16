import { ClerkProvider } from '@clerk/clerk-react';
import PluginGenerator from './components/PluginGenerator';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? '';

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <PluginGenerator />
    </ClerkProvider>
  );
}
