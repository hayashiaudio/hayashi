import { SERVER_BASE_URL } from './constants';

export interface GenerationResult {
  faustCode: string;
  prompt: string;
}

export async function generateFaust(prompt: string): Promise<GenerationResult> {
  const res = await fetch(`${SERVER_BASE_URL}/api/generate-faust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Generation failed');
  }

  const result = (await res.json()) as GenerationResult;
  console.log('[Hayashi] Faust generation response length:', result.faustCode?.length ?? 0);
  return result;
}
