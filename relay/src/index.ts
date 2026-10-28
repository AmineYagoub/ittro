// Ittro relay: the phone never holds the Meta API key. Only this relay
// calls Meta, and only with strict structured output. Every route except
// /health needs the app access code, is rate-limited per visitor, and
// stops for the day when the spending limit is reached.

export type Verdict = 'yes' | 'no' | 'cannot_verify';

export interface ConfirmAnswer {
  verdict: Verdict;
  spoken_summary: string;
  label_text: string | null;
}

interface JsonSchemaFormat {
  type: 'json_schema';
  name: string;
  schema: Record<string, unknown>;
  strict: true;
}

export const CONFIRM_SCHEMA = {
  name: 'confirm_product',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      verdict: { type: 'string', enum: ['yes', 'no', 'cannot_verify'] },
      spoken_summary: { type: 'string' },
      label_text: { type: ['string', 'null'] },
    },
    required: ['verdict', 'spoken_summary', 'label_text'],
  },
  strict: true,
};

const TRANSCRIBE_MODEL = 'muse-voice-transcribe-1.0';
const TRANSCRIBE_USD_PER_SECOND = 0.18 / 3600;

interface Limits {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
  META_API_BASE?: string;
  META_API_KEY?: string;
  APP_ACCESS_CODE?: string;
  DAILY_BUDGET_USD?: string;
  SPARK_COST_USD?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  ITTRO_LIMITS?: Limits;
}

interface SparkCall {
  fetchImpl: typeof fetch;
  apiBase: string | undefined;
  apiKey: string | undefined;
  input: unknown;
  effort?: string;
}

// Every Muse Spark call goes through here. The answer is accepted only
// when the response completed AND its output parses against the schema
// shape. Anything else is an error, never an empty default.
export async function callSpark({ fetchImpl, apiBase, apiKey, input, effort = 'low' }: SparkCall): Promise<ConfirmAnswer> {
  if (!apiBase) throw new Error('relay not configured: META_API_BASE');
  if (!apiKey) throw new Error('relay not configured: META_API_KEY');

  const res = await fetchImpl(`${apiBase}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'muse-spark-1.3',
      reasoning: { effort },
      input,
      text: { format: { type: 'json_schema', ...CONFIRM_SCHEMA } as JsonSchemaFormat },
    }),
  });

  if (!res.ok) {
    throw new Error(`spark http ${res.status}`);
  }
  const body = (await res.json()) as {
    status?: string;
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (body.status !== 'completed') {
    throw new Error(`spark not completed: ${body.status ?? 'unknown'}`);
  }
  const text: unknown = body.output_text ?? body.output?.[0]?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('spark answer has no text output');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('spark answer is not valid JSON');
  }
  if (!isConfirmAnswer(parsed)) {
    throw new Error('spark answer fails schema gate');
  }
  return parsed;
}

function isConfirmAnswer(value: unknown): value is ConfirmAnswer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v['verdict'] === 'yes' || v['verdict'] === 'no' || v['verdict'] === 'cannot_verify') &&
    typeof v['spoken_summary'] === 'string' &&
    (typeof v['label_text'] === 'string' || v['label_text'] === null)
  );
}

function codesEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

async function overRateLimit(env: Env, ip: string): Promise<boolean> {
  if (!env.ITTRO_LIMITS) {
    return false;
  }
  const perMinute = Number(env.RATE_LIMIT_PER_MINUTE ?? '30');
  const minute = Math.floor(Date.now() / 60000);
  const key = `rl:${ip}:${minute}`;
  const current = Number((await env.ITTRO_LIMITS.get(key)) ?? '0');
  if (current >= perMinute) {
    return true;
  }
  await env.ITTRO_LIMITS.put(key, String(current + 1), { expirationTtl: 120 });
  return false;
}

async function spendTodayUsd(env: Env): Promise<number> {
  if (!env.ITTRO_LIMITS) {
    return 0;
  }
  const day = new Date().toISOString().slice(0, 10);
  return Number((await env.ITTRO_LIMITS.get(`spend:${day}`)) ?? '0');
}

async function addSpendUsd(env: Env, amount: number): Promise<void> {
  if (!env.ITTRO_LIMITS) {
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = `spend:${day}`;
  const current = Number((await env.ITTRO_LIMITS.get(key)) ?? '0');
  await env.ITTRO_LIMITS.put(key, String(current + amount), { expirationTtl: 172800 });
}

async function gate(request: Request, env: Env, costUsd: number): Promise<Response | null> {
  const presented = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!env.APP_ACCESS_CODE || !codesEqual(presented, env.APP_ACCESS_CODE)) {
    return Response.json({ ok: false, error: 'unknown app' }, { status: 401 });
  }
  if (await overRateLimit(env, clientIp(request))) {
    return Response.json({ ok: false, error: 'too many requests, slow down' }, { status: 429 });
  }
  const budget = Number(env.DAILY_BUDGET_USD ?? '3');
  if ((await spendTodayUsd(env)) + costUsd > budget) {
    return Response.json({ ok: false, error: 'daily budget reached, back tomorrow' }, { status: 402 });
  }
  return null;
}

export async function transcribeClip(
  fetchImpl: typeof fetch,
  apiBase: string,
  apiKey: string,
  wav: ArrayBuffer,
  language: string,
  keywords: string[],
): Promise<string> {
  const requestPart: Record<string, unknown> = {
    model: TRANSCRIBE_MODEL,
    mode: 'PUSH_TO_TALK',
    language,
  };
  if (keywords.length > 0) {
    requestPart['keywords'] = keywords;
  }
  const form = new FormData();
  form.append('request', JSON.stringify(requestPart));
  form.append('audio', new Blob([wav], { type: 'audio/mp4' }), 'clip.m4a');
  const res = await fetchImpl(`${apiBase}/asr/transcribe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`transcribe http ${res.status}`);
  }
  const body = (await res.json()) as {
    turns?: Array<{ text?: unknown }>;
    text?: unknown;
  };
  if (Array.isArray(body.turns)) {
    const text = body.turns
      .map((turn) => (typeof turn.text === 'string' ? turn.text : ''))
      .join(' ')
      .trim();
    if (!text) {
      throw new Error('transcribe answer has no transcript');
    }
    return text;
  }
  if (typeof body.text === 'string') {
    return body.text.trim();
  }
  throw new Error('transcribe answer has no transcript');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/spark') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      try {
        const { input, effort } = (await request.json()) as { input: unknown; effort?: string };
        const answer = await callSpark({
          fetchImpl: fetch,
          apiBase: env.META_API_BASE,
          apiKey: env.META_API_KEY,
          input,
          effort,
        });
        await addSpendUsd(env, Number(env.SPARK_COST_USD ?? '0.01'));
        return Response.json({ ok: true, answer });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    if (request.method === 'POST' && url.pathname === '/transcribe') {
      try {
        const { audio, language, keywords, seconds } = (await request.json()) as {
          audio?: string;
          language?: string;
          keywords?: string[];
          seconds?: number;
        };
        if (typeof audio !== 'string' || audio.length === 0) {
          return Response.json({ ok: false, error: 'missing audio' }, { status: 400 });
        }
        const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
        const clipSeconds = typeof seconds === 'number' && seconds > 0 ? seconds : 5;
        const cost = clipSeconds * TRANSCRIBE_USD_PER_SECOND;
        const blocked = await gate(request, env, cost);
        if (blocked) {
          return blocked;
        }
        const text = await transcribeClip(
          fetch,
          env.META_API_BASE ?? '',
          env.META_API_KEY ?? '',
          bytes.buffer,
          language ?? 'en-US',
          Array.isArray(keywords) ? keywords : [],
        );
        await addSpendUsd(env, cost);
        return Response.json({ ok: true, text });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    return new Response('not found', { status: 404 });
  },
};
