// Ittro relay: the phone never holds the Meta API key. Only this relay
// calls Meta, and only with strict structured output. Every route except
// /health needs the app access code, is rate-limited per visitor, and
// stops for the day when the spending limit is reached.
import { understandUtterance, understandWithStill } from './understand.ts';
import { outlineProducts } from './sam.ts';
import { classifyScene, pickPackagePhrase, readShelfLabels } from './shelf.ts';
import { realtimeUrl, startRealtimeSession } from './realtime.ts';
import { confirmRoute, detailRoute } from './confirm.ts';
import { findRoute } from './find.ts';
import { askViewRoute } from './askView.ts';
import { helperRoutes } from './helperRoutes.ts';
import { askFields, effortField, mimeField, textField } from './bodies.ts';
import type { OutlineBody, PhraseBody, ReadBody } from './bodies.ts';
import { wrapSocket } from './streamWire.ts';
import { addSpendUsd, clientIp, codesEqual, gate, overRateLimit, recordSamCost, recordSparkCost, spendTodayUsd } from './gate.ts';
import type { Env } from './gate.ts';
import type { StreamBudget } from './realtime.ts';
import type { StreamSocket } from './streamWire.ts';

export { callSpark } from './spark.ts';
export type { ConfirmAnswer, Intent, SpokenLanguage, UnderstandAnswer, Verdict } from './spark.ts';
export { transcribeClip, wavSeconds } from './transcribe.ts';
export { understandUtterance, understandWithStill } from './understand.ts';
export type { UnderstandStill, UnderstoodView } from './understand.ts';
export { outlineProducts } from './sam.ts';
export type { OutlineArgs, OutlineResult, SamBox, SamMask, SamOutline } from './sam.ts';
export { classifyScene, pickPackagePhrase, readShelfLabels } from './shelf.ts';
export type { ClassifyArgs, ReadArgs, SceneKind, SceneResult, ShelfCrop, ShelfRead, ShelfResult, ShelfVerdict } from './shelf.ts';
export { findOnShelf, findRoute } from './find.ts';
export { askView, askViewRoute, isViewAnswer, VIEW_RULES } from './askView.ts';
export type { AskExchange, AskHints, AskViewArgs, AskViewResult, ViewAnswer } from './askView.ts';
export type { FindArgs, FindResult, FoundOutline } from './find.ts';
export { confirmInHand, confirmRoute, detailRoute, readLabelDetail } from './confirm.ts';
export type { ConfirmArgs, ConfirmAttr, ConfirmAttrs, ConfirmRead, ConfirmResult, ConfirmVerdict, DetailArgs, DetailKind, DetailRead, DetailReason, DetailResult, PictureProblem } from './confirm.ts';
export { processedMsToUsd, realtimeUrl, startRealtimeSession } from './realtime.ts';
export type { StreamBudget } from './realtime.ts';
export { buildMetaHandshake, parseMetaEvent, parsePhoneMessage, wrapSocket } from './streamWire.ts';
export type { MetaEvent, PhoneMessage, StreamSocket } from './streamWire.ts';
export { addSpendUsd, overRateLimit, spendTodayUsd } from './gate.ts';

interface PairedSocket {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  accept(): void;
  onopen: (() => void) | null;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true });
    }
    const helper = await helperRoutes(request, env);
    if (helper) {
      return helper;
    }
    if (request.method === 'POST' && url.pathname === '/understand') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      try {
        const context = (await request.json()) as Record<string, unknown> & {
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
        const understood = {
          transcript: context.transcript,
          language: typeof context.language === 'string' ? context.language : 'en',
          step: typeof context.step === 'string' ? context.step : 'welcome',
          pending_question: typeof context.pending_question === 'string' ? context.pending_question : null,
          pending_request: typeof context.pending_request === 'string' ? context.pending_request : null,
          last_line: typeof context.last_line === 'string' ? context.last_line : null,
          effort: typeof context.effort === 'string' ? context.effort : undefined,
        };
        const image = textField(context['image']);
        const answer = image
          ? await understandWithStill(fetch, env.META_API_BASE, env.META_API_KEY, understood, { ...askFields(context), image, mime: mimeField(context['mime']) })
          : await understandUtterance(fetch, env.META_API_BASE, env.META_API_KEY, understood);
        await recordSparkCost(env);
        return Response.json({ ok: true, answer });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    if (request.method === 'POST' && url.pathname === '/outline') {
      const blocked = await gate(request, env, Number(env.SAM_COST_USD ?? '0.0025'));
      if (blocked) {
        return blocked;
      }
      try {
        const body = (await request.json()) as OutlineBody;
        const image = textField(body.image);
        const phrase = textField(body.phrase);
        const w = typeof body.w === 'number' ? body.w : 0;
        const h = typeof body.h === 'number' ? body.h : 0;
        if (!image || !phrase || !Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) {
          return Response.json({ ok: false, error: 'missing image, phrase or photo size' }, { status: 400 });
        }
        const result = await outlineProducts(fetch, env.META_API_BASE, env.META_API_KEY, {
          image,
          mime: mimeField(body.mime),
          phrase,
          w,
          h,
        });
        await recordSamCost(env);
        return Response.json({ ok: true, outlines: result.outlines, samMs: result.samMs, maskMs: result.maskMs });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    if (request.method === 'POST' && url.pathname === '/find') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01') + Number(env.SAM_COST_USD ?? '0.0025'));
      if (blocked) {
        return blocked;
      }
      return findRoute(await request.json(), env);
    }
    if (request.method === 'POST' && url.pathname === '/ask-view') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      return askViewRoute(await request.json(), env);
    }
    if (request.method === 'POST' && url.pathname === '/package-phrase') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      try {
        const body = (await request.json()) as PhraseBody;
        const wanted = textField(body.request);
        const image = textField(body.image);
        if (!wanted || !image) {
          return Response.json({ ok: false, error: 'missing request or image' }, { status: 400 });
        }
        const phrase = await pickPackagePhrase(fetch, env.META_API_BASE, env.META_API_KEY, {
          request: wanted,
          image,
          mime: mimeField(body.mime),
        });
        await recordSparkCost(env);
        return Response.json({ ok: true, phrase });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    if (request.method === 'POST' && url.pathname === '/read-shelf') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      try {
        const body = (await request.json()) as ReadBody;
        const wanted = textField(body.request);
        const crops = Array.isArray(body.crops) ? body.crops : null;
        if (!wanted || !crops) {
          return Response.json({ ok: false, error: 'missing request or crops' }, { status: 400 });
        }
        const checked = crops.map((crop) => {
          const record = crop as { id?: unknown; image?: unknown; mime?: unknown };
          const id = textField(record.id);
          const image = textField(record.image);
          if (!id || !image) {
            throw new Error('each crop needs an id and an image');
          }
          return { id, image, mime: mimeField(record.mime) };
        });
        const result = await readShelfLabels(fetch, env.META_API_BASE, env.META_API_KEY, {
          request: wanted,
          crops: checked,
          effort: effortField(body.effort),
        });
        await recordSparkCost(env);
        return Response.json({ ok: true, reads: result.reads, readMs: result.readMs });
      } catch (err) {
        const status = (err as Error).message.includes('crop') && !(err as Error).message.includes('crop ids') ? 400 : 502;
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status });
      }
    }
    if (request.method === 'POST' && url.pathname === '/classify-scene') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      try {
        const body = (await request.json()) as PhraseBody;
        const wanted = textField(body.request);
        const image = textField(body.image);
        if (!wanted || !image) {
          return Response.json({ ok: false, error: 'missing request or image' }, { status: 400 });
        }
        const scene = await classifyScene(fetch, env.META_API_BASE, env.META_API_KEY, {
          request: wanted,
          image,
          mime: mimeField(body.mime),
        });
        await recordSparkCost(env);
        return Response.json({ ok: true, scene });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    if (request.method === 'POST' && url.pathname === '/confirm-hand') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      return confirmRoute(await request.json(), env);
    }
    if (request.method === 'POST' && url.pathname === '/read-detail') {
      const blocked = await gate(request, env, Number(env.SPARK_COST_USD ?? '0.01'));
      if (blocked) {
        return blocked;
      }
      return detailRoute(await request.json(), env);
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
      startRealtimeSession(wrapSocket(relaySide), openMeta, realtimeUrl(env.META_API_BASE ?? ''), env.META_API_KEY ?? '', budget);
      return new Response(null, { status: 101, webSocket: client } as unknown as ResponseInit);
    }
    return new Response('not found', { status: 404 });
  },
};
