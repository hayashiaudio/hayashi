export async function authHeaders(token: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.status === 401) {
    const requestUrl = typeof input === 'string' ? input : input.toString();
    const headers = new Headers(init?.headers ?? {});
    const attemptedAuth = headers.has('Authorization') || requestUrl.includes('accessToken=');

    if (attemptedAuth && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hayashi:auth-expired', {
        detail: {
          input: requestUrl,
          status: 401,
        },
      }));
    }
  }
  return response;
}
