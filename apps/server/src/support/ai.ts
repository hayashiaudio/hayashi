import type { SupportMessageRecord } from './repository.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

const AI_BASE_URL = (process.env.AI_BASE_URL ?? '').trim();
const AI_API_KEY = process.env.AI_API_KEY ?? '';
const AI_MODEL = (process.env.AI_MODEL ?? '').trim();
const AI_API_KEY_HEADER = (process.env.AI_API_KEY_HEADER ?? 'Authorization').trim();
const AI_API_KEY_PREFIX = process.env.AI_API_KEY_PREFIX ?? 'Bearer ';

function isConfigured() {
  return Boolean(AI_BASE_URL && AI_API_KEY && AI_MODEL);
}

function buildUrl() {
  if (AI_BASE_URL.endsWith('/chat/completions')) return AI_BASE_URL;
  return `${AI_BASE_URL.replace(/\/+$/, '')}/chat/completions`;
}

function buildHeaders(): Record<string, string> {
  const keyHeader = AI_API_KEY_HEADER || 'Authorization';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers[keyHeader] = keyHeader.toLowerCase() === 'authorization'
    ? `${AI_API_KEY_PREFIX}${AI_API_KEY}`
    : AI_API_KEY;
  return headers;
}

function extractText(data: OpenAICompatibleResponse): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text ?? '')
      .join('')
      .trim();
  }
  throw new Error(data.error?.message ?? 'Azure AI returned no content');
}

async function chat(messages: ChatMessage[]): Promise<string> {
  if (!isConfigured()) return '';
  const res = await fetch(buildUrl(), {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Azure-compatible AI error (${res.status}): ${text}`);
  }
  const data = await res.json() as OpenAICompatibleResponse;
  return extractText(data);
}

export async function buildSupportContext(messages: SupportMessageRecord[]) {
  if (!isConfigured() || messages.length === 0) {
    return {
      summary: messages[messages.length - 1]?.content.slice(0, 220) ?? '',
      context: {
        sentiment: 'unknown',
        urgency: 'normal',
        issues: [] as string[],
        nextStep: '',
      },
    };
  }

  const transcript = messages
    .slice(-24)
    .map((message) => `${message.authorRole.toUpperCase()}: ${message.content}`)
    .join('\n');

  const raw = await chat([
    {
      role: 'system',
      content: 'Summarize this support chat as compact JSON with keys summary, sentiment, urgency, issues, nextStep. Return only JSON.',
    },
    {
      role: 'user',
      content: transcript,
    },
  ]);

  try {
    const parsed = JSON.parse(raw) as {
      summary?: string;
      sentiment?: string;
      urgency?: string;
      issues?: string[];
      nextStep?: string;
    };
    return {
      summary: parsed.summary ?? '',
      context: {
        sentiment: parsed.sentiment ?? 'unknown',
        urgency: parsed.urgency ?? 'normal',
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        nextStep: parsed.nextStep ?? '',
      },
    };
  } catch {
    return {
      summary: raw.slice(0, 400),
      context: {
        sentiment: 'unknown',
        urgency: 'normal',
        issues: [] as string[],
        nextStep: '',
      },
    };
  }
}
