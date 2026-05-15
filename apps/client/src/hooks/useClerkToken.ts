import { useAuth } from '@clerk/clerk-react';
import { useCallback } from 'react';

export function useClerkToken() {
  const { getToken, isSignedIn } = useAuth();

  const getClerkToken = useCallback(async (): Promise<string | null> => {
    if (!isSignedIn) return null;
    try {
      const token = await getToken();
      return token ?? null;
    } catch (err) {
      console.error('[Hayashi] Failed to get Clerk token:', err);
      return null;
    }
  }, [getToken, isSignedIn]);

  return { getToken: getClerkToken, isSignedIn };
}
