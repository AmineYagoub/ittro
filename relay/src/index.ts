// Ittro relay: the phone never holds the Meta API key. Only this relay
// calls Meta, and only with strict structured output. Every route except
// /health needs the app access code, is rate-limited per visitor, and
// stops for the day when the spending limit is reached.
import { TRANSCRIBE_USD_PER_SECOND, transcribeClip, wavSeconds } from './transcribe.ts';
import { callSpark } from './spark.ts';
import { understandUtterance } from './understand.ts';
import { startRealtimeSession } from './realtime.ts';
import { wrapSocket } from './streamWire.ts';
import type { StreamBudget } from './realtime.ts';
import type { StreamSocket } from './streamWire.ts';

export { callSpark } from './spark.ts';
export type { ConfirmAnswer, Intent, SpokenLanguage, UnderstandAnswer, Verdict } from './spark.ts';
export { transcribeClip, wavSeconds } from './transcribe.ts';
export { understandUtterance } from './understand.ts';
export { processedMsToUsd, startRealtimeSession } from './realtime.ts';
export type { StreamBudget } from './realtime.ts';
export { buildMetaHandshake, parseMetaEvent, parsePhoneMessage, wrapSocket } from './streamWire.ts';
export type { MetaEvent, PhoneMessage, StreamSocket } from './streamWire.ts';

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

interface PairedSocket {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  accept(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

function newWebSocketPair(): [PairedSocket, PairedSocket] | null {
  const global = globalThis as unknown as { WebSocketPair?: new () => [PairedSocket, PairedSocket] };
  if (typeof global.WebSocketPair !== 'function') {
    return null;
  }
  return new global.WebSocketPair();
}

export async function overRateLimit(env: Env, ip: string): Promise<boolean> {
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

export async function spendTodayUsd(env: Env): Promise<number> {
  if (!env.ITTRO_LIMITS) {
    return 0;
  }
  const day = new Date().toISOString().slice(0, 10);
  return Number((await env.ITTRO_LIMITS.get(`spend:${day}`)) ?? '0');
}

export async function addSpendUsd(env: Env, amount: number): Promise<void> {
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

async function sparkCostUsd(env: Env): Promise<void> {
  await addSpendUsd(env, Number(env.SPARK_COST_USD ?? '0.01'));
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
        await sparkCostUsd(env);
        return Response.json({ ok: true, answer });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    if (request.method === 'POST' && url.pathname === '/transcribe') {
      try {
        const { audio, language, keywords } = (await request.json()) as {
          audio?: string;
          language?: string;
          keywords?: string[];
        };
        if (typeof audio !== 'string' || audio.length === 0) {
          return Response.json({ ok: false, error: 'missing audio' }, { status: 400 });
        }
        const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
        const cost = wavSeconds(bytes.buffer) * TRANSCRIBE_USD_PER_SECOND;
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
    if (request.method === 'POST' && url.pathname === '/understand') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      try {
        const context = (await request.json()) as {
          transcript?: unknown;
          language?: unknown;
          step?: unknown;
          pending_question?: unknown;
          pending_request?: unknown;
          last_line?: unknown;
          effort?: unknown;
        };
        if (typeof context.transcript !== 'string' || context.transcript.trim().length === 0) {
          return Response.json({ ok: false, error: 'missing transcript' }, { status: 400 });
        }
        const answer = await understandUtterance(fetch, env.META_API_BASE, env.META_API_KEY, {
          transcript: context.transcript,
          language: typeof context.language === 'string' ? context.language : 'en',
          step: typeof context.step === 'string' ? context.step : 'welcome',
          pending_question: typeof context.pending_question === 'string' ? context.pending_question : null,
          pending_request: typeof context.pending_request === 'string' ? context.pending_request : null,
          last_line: typeof context.last_line === 'string' ? context.last_line : null,
          effort: typeof context.effort === 'string' ? context.effort : undefined,
        });
        await sparkCostUsd(env);
        return Response.json({ ok: true, answer });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    if (url.pathname === '/realtime') {
      const code = url.searchParams.get('code') ?? '';
      if (!env.APP_ACCESS_CODE || !codesEqual(code, env.APP_ACCESS_CODE)) {
        return Response.json({ ok: false, error: 'unknown app' }, { status: 401 });
      }
      if (await overRateLimit(env, clientIp(request))) {
        return Response.json({ ok: false, error: 'too many requests, slow down' }, { status: 429 });
      }
      if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
        return Response.json({ ok: false, error: 'websocket required' }, { status: 400 });
      }
      const pair = newWebSocketPair();
      if (!pair) {
        return Response.json({ ok: false, error: 'streaming unavailable here' }, { status: 501 });
      }
      const [client, relaySide] = pair;
      relaySide.accept();
      const budget: StreamBudget = {
        spendToday: () => spendTodayUsd(env),
        addSpend: (usd) => addSpendUsd(env, usd),
        budget: () => Number(env.DAILY_BUDGET_USD ?? '3'),
      };
      const openMeta = (metaUrl: string): StreamSocket =>
        wrapSocket(new WebSocket(metaUrl) as unknown as Parameters<typeof wrapSocket>[0]);
      startRealtimeSession(wrapSocket(relaySide), openMeta, `${env.META_API_BASE ?? ''}/asr/realtime`, env.META_API_KEY ?? '', budget);
      return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
    }
    return new Response('not found', { status: 404 });
  },
};
