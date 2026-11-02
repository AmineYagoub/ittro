// Walks the helper system on the relay: pairing by voice code,
// asking with a photo, answers back, and deletion after the answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resetHelpers } from '../src/helpers.ts';
import { helperRoutes } from '../src/helperRoutes.ts';
import type { Env } from '../src/gate.ts';

const env: Env = { APP_ACCESS_CODE: 'test-code' };

const IMAGE = `data:image/jpeg;base64,${'a'.repeat(100)}`;

function app(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('authorization')) {
    headers.set('authorization', 'Bearer test-code');
  }
  return helperRoutes(new Request(`https://relay.invalid${path}`, { ...init, headers }), env) as Promise<Response>;
}

async function pairHelper(name: string): Promise<{ code: string; expiresAt: number }> {
  const res = (await app('/helper-pair', { method: 'POST', body: JSON.stringify({ name }) })) as Response;
  assert.equal(res.status, 200);
  return (await res.json()) as { code: string; expiresAt: number };
}

async function joinHelper(code: string): Promise<{ token: string; name: string }> {
  const res = (await helperRoutes(
    new Request('https://relay.invalid/helper-join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
    env,
  )) as Response;
  assert.equal(res.status, 200);
  return (await res.json()) as { token: string; name: string };
}

async function askHelper(tokens: string[]): Promise<{ id: string; helpers: string[] }> {
  const res = (await app('/helper-ask', {
    method: 'POST',
    body: JSON.stringify({
      tokens,
      question: 'is this Masaad water, 1.5 litres?',
      request: 'Masaad water, 1.5 litres',
      read: 'Masaad, size unreadable',
      image: IMAGE,
      mime: 'image/jpeg',
    }),
  })) as Response;
  assert.equal(res.status, 200);
  return (await res.json()) as { id: string; helpers: string[] };
}

async function answerAs(token: string, id: string, verdict: string, note: string | null): Promise<Response> {
  return (await helperRoutes(
    new Request('https://relay.invalid/helper-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, id, verdict, note }),
    }),
    env,
  )) as Response;
}

test('pairs by code, asks, and deletes the photo on answer', async () => {
  resetHelpers();
  try {
    const { code } = await pairHelper('Sara');
    assert.match(code, /^\d{6}$/);
    const waiting = (await (await app(`/helper-pair?code=${code}`)).json()) as { state: string };
    assert.equal(waiting.state, 'waiting');
    const { token } = await joinHelper(code);
    const joined = (await (await app(`/helper-pair?code=${code}`)).json()) as { state: string; helper: string; token: string };
    assert.equal(joined.state, 'joined');
    assert.equal(joined.helper, 'Sara');
    assert.equal(joined.token, token);
    const { id } = await askHelper([token]);
    const before = (await (
      (await helperRoutes(new Request(`https://relay.invalid/helper-next?token=${token}`), env)) as Response
    ).json()) as { question: { image: string } | null };
    assert.ok(before.question?.image);
    assert.equal((await answerAs(token, id, 'yes', "it's the big one")).status, 200);
    const status = (await (await app(`/helper-status?id=${id}`)).json()) as {
      status: string;
      answer: { verdict: string; note: string; helper: string };
    };
    assert.equal(status.status, 'answered');
    assert.equal(status.answer.verdict, 'yes');
    assert.equal(status.answer.note, "it's the big one");
    assert.equal(status.answer.helper, 'Sara');
    const after = (await (
      (await helperRoutes(new Request(`https://relay.invalid/helper-next?token=${token}`), env)) as Response
    ).json()) as { question: unknown };
    assert.equal(after.question, null);
  } finally {
    resetHelpers();
  }
});

test('cancel deletes the photo and ends the wait', async () => {
  resetHelpers();
  try {
    const { code } = await pairHelper('Sara');
    const { token } = await joinHelper(code);
    const { id } = await askHelper([token]);
    const cancelled = (await app('/helper-cancel', { method: 'POST', body: JSON.stringify({ id }) })) as Response;
    assert.equal(cancelled.status, 200);
    const status = (await (await app(`/helper-status?id=${id}`)).json()) as { status: string };
    assert.equal(status.status, 'cancelled');
    const next = (await (
      (await helperRoutes(new Request(`https://relay.invalid/helper-next?token=${token}`), env)) as Response
    ).json()) as { question: unknown };
    assert.equal(next.question, null);
  } finally {
    resetHelpers();
  }
});

test('app routes need the access code', async () => {
  resetHelpers();
  try {
    const res = (await helperRoutes(
      new Request('https://relay.invalid/helper-pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Sara' }),
      }),
      env,
    )) as Response;
    assert.equal(res.status, 401);
  } finally {
    resetHelpers();
  }
});

test('rejects bad input instead of storing it', async () => {
  resetHelpers();
  try {
    const noName = (await app('/helper-pair', { method: 'POST', body: JSON.stringify({ name: '' }) })) as Response;
    assert.equal(noName.status, 400);
    assert.equal((await answerAs('x', 'y', 'maybe', null)).status, 400);
    assert.equal((await answerAs('x', 'y', 'yes', 'n'.repeat(201))).status, 400);
    const huge = (await app('/helper-ask', {
      method: 'POST',
      body: JSON.stringify({
        tokens: ['x'],
        question: 'q?',
        request: 'r',
        read: '',
        image: 'a'.repeat(2000001),
        mime: 'image/jpeg',
      }),
    })) as Response;
    assert.equal(huge.status, 400);
  } finally {
    resetHelpers();
  }
});

test('serves the helper page and its service worker', async () => {
  resetHelpers();
  try {
    const page = (await helperRoutes(new Request('https://relay.invalid/help'), env)) as Response;
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, />Yes</);
    assert.match(html, />No</);
    assert.match(html, />Can't tell</);
    assert.match(html, /deleted when you answer/);
    const worker = (await helperRoutes(new Request('https://relay.invalid/help/sw.js'), env)) as Response;
    assert.equal(worker.status, 200);
    assert.match(await worker.text(), /showNotification/);
  } finally {
    resetHelpers();
  }
});
