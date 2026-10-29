// The helper routes on the relay: pairing, the helper's page,
// questions and answers. App routes need the access code; helper
// browser routes are rate-limited and keyed by code and token.
import { gate, overRateLimit, clientIp } from './gate.ts';
import type { Env } from './gate.ts';
import { pushSubscriptionInvalid, readPushSubscription, sendTickle } from './push.ts';
import { HELP_PAGE, HELP_SW } from './helperPage.ts';
import {
  MAX_IMAGE_CHARS,
  MAX_NOTE_CHARS,
  answerQuestion,
  askQuestion,
  cancelQuestion,
  cleanName,
  cleanText,
  issuePair,
  joinPair,
  listHelpers,
  nextQuestion,
  pairState,
  pushTargets,
  questionStatus,
  storePush,
} from './helpers.ts';
import type { HelperVerdict } from './helpers.ts';

function validVerdict(value: unknown): value is HelperVerdict {
  return value === 'yes' || value === 'no' || value === 'cant_tell';
}

function pushConfig(env: Env): Response {
  return Response.json({ ok: true, vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null });
}

async function browserAllowed(request: Request, env: Env): Promise<Response | null> {
  if (await overRateLimit(env, clientIp(request))) {
    return Response.json({ ok: false, error: 'too many requests, slow down' }, { status: 429 });
  }
  return null;
}

export async function helperRoutes(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/help') {
    return new Response(HELP_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  if (request.method === 'GET' && url.pathname === '/help/sw.js') {
    return new Response(HELP_SW, { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  }
  if (request.method === 'GET' && url.pathname === '/help/config') {
    return pushConfig(env);
  }
  if (request.method === 'POST' && url.pathname === '/helper-pair') {
    const blocked = await gate(request, env, 0);
    if (blocked) {
      return blocked;
    }
    const body = (await request.json()) as Record<string, unknown>;
    const name = cleanName(body['name']);
    if (!name) {
      return Response.json({ ok: false, error: 'missing helper name' }, { status: 400 });
    }
    return Response.json({ ok: true, ...issuePair(name) });
  }
  if (request.method === 'GET' && url.pathname === '/helper-pair') {
    const blocked = await gate(request, env, 0);
    if (blocked) {
      return blocked;
    }
    return Response.json({ ok: true, ...pairState(url.searchParams.get('code') ?? '') });
  }
  if (request.method === 'GET' && url.pathname === '/helpers') {
    const blocked = await gate(request, env, 0);
    if (blocked) {
      return blocked;
    }
    return Response.json({ ok: true, helpers: listHelpers() });
  }
  if (request.method === 'POST' && url.pathname === '/helper-join') {
    const limited = await browserAllowed(request, env);
    if (limited) {
      return limited;
    }
    const body = (await request.json()) as Record<string, unknown>;
    const code = typeof body['code'] === 'string' ? body['code'].replace(/\D/g, '') : '';
    if (pushSubscriptionInvalid(body)) {
      return Response.json({ ok: false, error: 'bad push subscription' }, { status: 400 });
    }
    const joined = code.length === 6 ? joinPair(code, readPushSubscription(body)) : null;
    if (!joined) {
      return Response.json({ ok: false, error: 'unknown or expired code' }, { status: 404 });
    }
    return Response.json({ ok: true, ...joined });
  }
  if (request.method === 'POST' && url.pathname === '/helper-push') {
    const limited = await browserAllowed(request, env);
    if (limited) {
      return limited;
    }
    const body = (await request.json()) as Record<string, unknown>;
    const token = typeof body['token'] === 'string' ? body['token'] : '';
    const push = readPushSubscription(body);
    if (!token || !push) {
      return Response.json({ ok: false, error: 'missing token or push subscription' }, { status: 400 });
    }
    if (!storePush(token, push)) {
      return Response.json({ ok: false, error: 'unknown helper' }, { status: 404 });
    }
    return Response.json({ ok: true });
  }
  if (request.method === 'GET' && url.pathname === '/helper-next') {
    const limited = await browserAllowed(request, env);
    if (limited) {
      return limited;
    }
    const question = nextQuestion(url.searchParams.get('token') ?? '');
    if (!question) {
      return Response.json({ ok: true, question: null });
    }
    return Response.json({
      ok: true,
      question: {
        id: question.id,
        question: question.question,
        request: question.request,
        read: question.read,
        image: question.image,
        mime: question.mime,
      },
    });
  }
  if (request.method === 'POST' && url.pathname === '/helper-answer') {
    const limited = await browserAllowed(request, env);
    if (limited) {
      return limited;
    }
    const body = (await request.json()) as Record<string, unknown>;
    const token = typeof body['token'] === 'string' ? body['token'] : '';
    const id = typeof body['id'] === 'string' ? body['id'] : '';
    const note = body['note'] === null || body['note'] === undefined ? null : cleanText(body['note'], MAX_NOTE_CHARS);
    if (!token || !id || !validVerdict(body['verdict']) || (body['note'] !== null && body['note'] !== undefined && note === null)) {
      return Response.json({ ok: false, error: 'missing token, id, verdict or note too long' }, { status: 400 });
    }
    if (!answerQuestion(token, id, body['verdict'], note)) {
      return Response.json({ ok: false, error: 'unknown question' }, { status: 404 });
    }
    return Response.json({ ok: true });
  }
  if (request.method === 'POST' && url.pathname === '/helper-ask') {
    const blocked = await gate(request, env, 0);
    if (blocked) {
      return blocked;
    }
    const body = (await request.json()) as Record<string, unknown>;
    const tokens = Array.isArray(body['tokens']) ? body['tokens'].filter((token) => typeof token === 'string') : [];
    const question = cleanText(body['question'], 300);
    const wanted = cleanText(body['request'], 200);
    const read = typeof body['read'] === 'string' && body['read'].length <= 300 ? body['read'] : null;
    const image = typeof body['image'] === 'string' ? body['image'] : '';
    const mime = body['mime'] === 'image/jpeg' || body['mime'] === 'image/png' ? body['mime'] : null;
    if (tokens.length === 0 || !question || !wanted || read === null || !mime || !image || image.length > MAX_IMAGE_CHARS) {
      return Response.json({ ok: false, error: 'missing helpers, question, request, read or photo' }, { status: 400 });
    }
    const asked = askQuestion({ tokens, question, request: wanted, read, image, mime });
    if (!asked) {
      return Response.json({ ok: false, error: 'unknown helpers' }, { status: 404 });
    }
    const id = asked.id;
    await Promise.allSettled(pushTargets(id).map((push) => sendTickle(fetch, env, push)));
    return Response.json({ ok: true, ...asked });
  }
  if (request.method === 'GET' && url.pathname === '/helper-status') {
    const blocked = await gate(request, env, 0);
    if (blocked) {
      return blocked;
    }
    const question = questionStatus(url.searchParams.get('id') ?? '');
    if (!question) {
      return Response.json({ ok: false, error: 'unknown question' }, { status: 404 });
    }
    return Response.json({
      ok: true,
      status: question.status,
      helpers: question.names,
      answer: question.answer,
    });
  }
  if (request.method === 'POST' && url.pathname === '/helper-cancel') {
    const blocked = await gate(request, env, 0);
    if (blocked) {
      return blocked;
    }
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body['id'] !== 'string' || !cancelQuestion(body['id'])) {
      return Response.json({ ok: false, error: 'unknown question' }, { status: 404 });
    }
    return Response.json({ ok: true });
  }
  return null;
}
