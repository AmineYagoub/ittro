// Waiting and push for helpers: the first answer wins, codes and
// photos expire, and asking tickles helpers with a signed push.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { PHOTO_TTL_MS, PAIR_TTL_MS, resetHelpers, setHelperClock } from '../src/helpers.ts';
import { helperRoutes } from '../src/helperRoutes.ts';
import { vapidJwt } from '../src/push.ts';
import type { Env } from '../src/gate.ts';

const env: Env = { APP_ACCESS_CODE: 'test-code' };

const appHeaders = { authorization: 'Bearer test-code', 'content-type': 'application/json' };

const IMAGE = `data:image/jpeg;base64,${'a'.repeat(100)}`;

function routes(path: string, init: RequestInit, routeEnv: Env = env): Promise<Response> {
  const headers = new Headers({ ...appHeaders, ...(init.headers ?? {}) });
  return helperRoutes(new Request(`https://relay.invalid${path}`, { ...init, headers }), routeEnv) as Promise<Response>;
}

function browser(path: string, init: RequestInit, routeEnv: Env = env): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json', ...(init.headers ?? {}) });
  return helperRoutes(new Request(`https://relay.invalid${path}`, { ...init, headers }), routeEnv) as Promise<Response>;
}

async function pairJoinAsk(
  routeEnv: Env = env,
): Promise<{ token: string; id: string; answer: (verdict: string) => Promise<Response> }> {
  const pairRes = (await routes('/helper-pair', { method: 'POST', body: JSON.stringify({ name: 'Sara' }) }, routeEnv)) as Response;
  const { code } = (await pairRes.json()) as { code: string };
  const joinRes = (await browser('/helper-join', { method: 'POST', body: JSON.stringify({ code }) }, routeEnv)) as Response;
  const { token } = (await joinRes.json()) as { token: string };
  const askRes = (await routes(
    '/helper-ask',
    {
      method: 'POST',
      body: JSON.stringify({
        tokens: [token],
        question: 'is this it?',
        request: 'Masaad water',
        read: 'Masaad',
        image: IMAGE,
        mime: 'image/jpeg',
      }),
    },
    routeEnv,
  )) as Response;
  const { id } = (await askRes.json()) as { id: string };
  const answer = (verdict: string): Promise<Response> =>
    browser('/helper-answer', { method: 'POST', body: JSON.stringify({ token, id, verdict, note: null }) }, routeEnv);
  return { token, id, answer };
}

test('the first answer wins', async () => {
  resetHelpers();
  try {
    const first = await pairJoinAsk();
    const pairRes = (await routes('/helper-pair', { method: 'POST', body: JSON.stringify({ name: 'Omar' }) })) as Response;
    const { code } = (await pairRes.json()) as { code: string };
    const joinRes = (await browser('/helper-join', { method: 'POST', body: JSON.stringify({ code }) })) as Response;
    const { token } = (await joinRes.json()) as { token: string };
    assert.equal((await first.answer('no')).status, 200);
    const late = (await browser(
      '/helper-answer',
      { method: 'POST', body: JSON.stringify({ token, id: first.id, verdict: 'yes', note: null }) },
    )) as Response;
    assert.equal(late.status, 404);
    const status = (await (await routes(`/helper-status?id=${first.id}`, {})) .json()) as {
      answer: { verdict: string; helper: string };
    };
    assert.equal(status.answer.verdict, 'no');
    assert.equal(status.answer.helper, 'Sara');
  } finally {
    resetHelpers();
  }
});

test('codes expire after ten minutes, photos after thirty', async () => {
  resetHelpers();
  try {
    let now = Date.now();
    setHelperClock(() => now);
    const pairRes = (await routes('/helper-pair', { method: 'POST', body: JSON.stringify({ name: 'Sara' }) })) as Response;
    const { code } = (await pairRes.json()) as { code: string };
    now += PAIR_TTL_MS + 1000;
    const joined = (await browser('/helper-join', { method: 'POST', body: JSON.stringify({ code }) })) as Response;
    assert.equal(joined.status, 404);
    const { token, id } = await pairJoinAsk();
    assert.ok(token);
    now += PHOTO_TTL_MS + 1000;
    const gone = (await routes(`/helper-status?id=${id}`, {})) as Response;
    assert.equal(gone.status, 404);
    const next = (await browser(`/helper-next?token=${token}`, {})) as Response;
    const body = (await next.json()) as { question: unknown };
    assert.equal(body.question, null);
  } finally {
    resetHelpers();
  }
});

test('asking tickles helpers with a signed VAPID push', async () => {
  resetHelpers();
  const realFetch = globalThis.fetch;
  try {
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const rawPublic = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
    const jwk = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)) as { d?: string };
    const pushEnv: Env = {
      APP_ACCESS_CODE: 'test-code',
      VAPID_PUBLIC_KEY: rawPublic,
      VAPID_PRIVATE_KEY: jwk.d ?? '',
      VAPID_SUBJECT: 'mailto:test@ittro.example',
    };
    const seen: Array<{ url: string; auth: string }> = [];
    globalThis.fetch = (async (url: unknown, init?: { headers?: Record<string, string> }) => {
      seen.push({ url: String(url), auth: init?.headers?.['authorization'] ?? '' });
      return { ok: true, status: 201 };
    }) as unknown as typeof fetch;
    const pairRes = (await routes('/helper-pair', { method: 'POST', body: JSON.stringify({ name: 'Sara' }) }, pushEnv)) as Response;
    const { code } = (await pairRes.json()) as { code: string };
    const push = { endpoint: 'https://push.example/send/abc', keys: { p256dh: 'x', auth: 'y' } };
    const joinRes = (await browser('/helper-join', { method: 'POST', body: JSON.stringify({ code, push }) }, pushEnv)) as Response;
    assert.equal(joinRes.status, 200);
    const { token } = (await joinRes.json()) as { token: string };
    const askRes = (await routes(
      '/helper-ask',
      {
        method: 'POST',
        body: JSON.stringify({
          tokens: [token],
          question: 'is this it?',
          request: 'Masaad water',
          read: 'Masaad',
          image: IMAGE,
          mime: 'image/jpeg',
        }),
      },
      pushEnv,
    )) as Response;
    assert.equal(askRes.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://push.example/send/abc');
    assert.match(seen[0].auth, /^vapid t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+, k=/);
    const jwt = seen[0].auth.replace(/^vapid t=/, '').split(', k=')[0];
    assert.equal(await vapidVerifies(jwt, rawPublic), true);
  } finally {
    globalThis.fetch = realFetch;
    resetHelpers();
  }
});

async function vapidVerifies(jwt: string, rawPublic: string): Promise<boolean> {
  const [header, claims, signature] = jwt.split('.');
  const pubBytes = Buffer.from(rawPublic, 'base64url');
  const key = await webcrypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: Buffer.from(pubBytes.subarray(1, 33)).toString('base64url'),
      y: Buffer.from(pubBytes.subarray(33, 65)).toString('base64url'),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  return webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    Buffer.from(signature, 'base64url'),
    new TextEncoder().encode(`${header}.${claims}`),
  );
}

test('the VAPID signature is skipped without keys, never failing the ask', async () => {
  resetHelpers();
  try {
    assert.equal(await vapidJwt({ APP_ACCESS_CODE: 'x' }, 'https://push.example'), null);
  } finally {
    resetHelpers();
  }
});
