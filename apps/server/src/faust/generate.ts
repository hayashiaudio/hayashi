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

function inferPluginType(prompt: string): 'synth' | 'effect' | 'percussion' {
  const p = prompt.toLowerCase();
  if (p.includes('reverb') || p.includes('delay') || p.includes('filter') || p.includes('chorus') || p.includes('flanger') || p.includes('phaser') || p.includes('echo') || p.includes('distortion') || p.includes('compressor') || p.includes('modulator') || p.includes('effect')) {
    return 'effect';
  }
  if (p.includes('kick') || p.includes('snare') || p.includes('hat') || p.includes('perc') || p.includes('drum') || p.includes('clap') || p.includes('tom')) {
    return 'percussion';
  }
  return 'synth';
}

function buildIterationSystemPrompt(
  type: 'synth' | 'effect' | 'percussion',
  previousParams: { name: string; min: number; max: number }[]
): string {
  const paramContext = previousParams.length > 0
    ? `\nCurrent parameters (preserve these exact names and ranges unless the user asks to change them):\n${previousParams.map(p => `- ${p.name}: range ${p.min} to ${p.max}`).join('\n')}`
    : '';

  const typeRules = {
    synth: 'Expose parameters: freq, gain, gate. Include ADSR envelope.',
    percussion: 'Expose parameters: freq, gain, trigger. Include percussive envelope.',
    effect: 'Expose parameters: mix, input_gain. Process incoming audio via process = _ : ...;',
  };

  return `
YOU ARE A FAUST DSP COMPILER. You are EDITING existing Faust code based on the user's instruction.

Rules:
- Output ONLY the complete updated Faust code. No markdown, no explanation, no backticks.
- Use standard Faust libraries: import("stdfaust.lib");
- ${typeRules[type]}
- Keep the code under 50 lines.
- Ensure no feedback loops without proper delay.
- Preserve the overall structure and parameter names from the previous version unless the user explicitly asks to change them.${paramContext}
- If the user asks to "add" or "increase" something, modify the existing code rather than rewriting from scratch.
- Return the FULL code, not a diff.
`;
}

export async function iterateFaustFromPrompt(
  instruction: string,
  previousCode: string,
  previousPrompts: string[],
  type: 'synth' | 'effect' | 'percussion',
  previousParams: { name: string; min: number; max: number }[]
): Promise<string> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('Cloudflare Workers AI credentials not configured.');
  }

  const systemPrompt = buildIterationSystemPrompt(type, previousParams);
  const historyMessages = previousPrompts.map((p, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: p,
  }));

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Current Faust code:\n${previousCode}` },
    ...historyMessages,
    { role: 'user', content: `Apply this change: ${instruction}` },
  ];

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/moonshotai/kimi-k2.6`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Workers AI error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as WorkersAIResponse;
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

  return raw
    .replace(/```faust\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}

export { inferPluginType };
