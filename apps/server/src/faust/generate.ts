const SYSTEM_PROMPT = `
YOU ARE A FAUST DSP COMPILER. The user describes a sound. You output ONLY valid Faust code that produces that sound as a synthesizer or effect.

Rules:
- Output ONLY the Faust code. No markdown, no explanation, no backticks.
- Use standard Faust libraries: import("stdfaust.lib");
- If it's a synth, expose these parameters with exact names: freq, gain, gate (for envelope triggering).
- If it's a percussion one-shot, expose: freq, gain, trigger.
- If it's an effect, expose: mix, input gain.
- Keep the code under 40 lines.
- Ensure no feedback loops without proper delay.
- Include a simple ADSR or percussive envelope for synth sounds.
`;

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '';
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? '';

interface WorkersAIResponse {
  result?: { response?: string } | string;
  success?: boolean;
  errors?: Array<{ code: number; message: string }>;
  response?: string;
}

export async function generateFaustFromPrompt(prompt: string): Promise<string> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Cloudflare Workers AI credentials not configured. Set CF_ACCOUNT_ID and CF_API_TOKEN.');
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/moonshotai/kimi-k2.6`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Workers AI error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as WorkersAIResponse;
  console.log('[Hayashi] Workers AI raw response keys:', Object.keys(data ?? {}));

  if (!data.success && data.errors && data.errors.length > 0) {
    throw new Error(`Workers AI error: ${data.errors[0].message}`);
  }

  let raw = '';
  if (data.result && typeof data.result === 'object' && 'response' in data.result) {
    raw = data.result.response ?? '';
  } else if (typeof data.result === 'string') {
    raw = data.result;
  } else if (data.response) {
    raw = data.response;
  }

  console.log('[Hayashi] Workers AI raw text length:', raw.length);

  return raw
    .replace(/```faust\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}
