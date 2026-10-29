// The helper store on the relay's own KV: a pairing made in one
// isolate is there in the next, with the same expiries, and the
// photo is gone on answer, cancel or thirty minutes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_TTL_MS, PAIR_TTL_MS, resetHelpers, setHelperClock } from '../src/helpers.ts';
import type { KvBinding } from '../src/helperStore.ts';
import { helperRoutes } from '../src/helperRoutes.ts';
import worker from '../src/index.ts';
import type { Env } from '../src/gate.ts';

const IMAGE = `data:image/jpeg;base64,${'a'.repeat(100)}`;

interface FakeKv {
  binding: KvBinding;
  values: Map<string, string>;
  ttls: Map<string, number | undefined>;
}

function fakeKv(): FakeKv {
  const values = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  const binding: KvBinding = {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value, options) => {
      values.set(key, value);
      ttls.set(key, options?.expirationTtl);
    },
    list: async ({ prefix }) => ({ keys: [...values.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) }),
  };
  return { binding, values, ttls };
}

function isolate(binding: KvBinding): Env {
  return { APP_ACCESS_CODE: 'test-code', ITTRO_HELPERS: binding };
}

async function pairOn(env: Env, name: string): Promise<{ code: string }> {
  const res = (await helperRoutes(
    new Request('https://relay.invalid/helper-pair', {
      method: 'POST',
      headers: { authorization: 'Bearer test-code', 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
    env,
  )) as Response;
  assert.equal(res.status, 200);
  return (await res.json()) as { code: string };
}

async function joinOn(env: Env, code: string): Promise<{ token: string }> {
  const res = (await helperRoutes(
    new Request('https://relay.invalid/helper-join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
    env,
  )) as Response;
  assert.equal(res.status, 200);
  return (await res.json()) as { token: string };
}

async function askOn(env: Env, token: string): Promise<{ id: string }> {
  const res = (await helperRoutes(
    new Request('https://relay.invalid/helper-ask', {
      method: 'POST',
      headers: { authorization: 'Bearer test-code', 'content-type': 'application/json' },
      body: JSON.stringify({
        tokens: [token],
        question: 'is this Masaad water, 1.5 litres?',
        request: 'Masaad water, 1.5 litres',
        read: 'Masaad, size unreadable',
        image: IMAGE,
        mime: 'image/jpeg',
      }),
    }),
    env,
  )) as Response;
  assert.equal(res.status, 200);
  return (await res.json()) as { id: string };
}

test('a pairing survives across isolates with KV expiries', async () => {
  resetHelpers();
  try {
    const kv = fakeKv();
    const first = isolate(kv.binding);
    const second = isolate(kv.binding);
    const { code } = await pairOn(first, 'Sara');
    assert.equal(kv.ttls.get(`pair:${code}`), PAIR_TTL_MS / 1000);
    const { token } = await joinOn(second, code);
    assert.ok(token);
    const joined = (await (
      await helperRoutes(new Request(`https://relay.invalid/helper-pair?code=${code}`, { headers: { authorization: 'Bearer test-code' } }), first)
    ).json()) as { state: string; token: string };
    assert.equal(joined.state, 'joined');
    assert.equal(joined.token, token);
    const listed = (await (
      await helperRoutes(new Request('https://relay.invalid/helpers', { headers: { authorization: 'Bearer test-code' } }), second)
    ).json()) as { helpers: Array<{ name: string }> };
    assert.deepEqual(listed.helpers.map((helper) => helper.name), ['Sara']);
    const { id } = await askOn(first, token);
    assert.equal(kv.ttls.get(`question:${id}`), PHOTO_TTL_MS / 1000);
    const next = (await (
      await helperRoutes(new Request(`https://relay.invalid/helper-next?token=${token}`), second)
    ).json()) as { question: { image: string } | null };
    assert.equal(next.question?.image, IMAGE);
  } finally {
    resetHelpers();
  }
});

test('the photo is gone on answer, cancel or thirty minutes', async () => {
  resetHelpers();
  try {
    const kv = fakeKv();
    const env = isolate(kv.binding);
    let now = Date.now();
    setHelperClock(() => now);
    const first = await pairOn(env, 'Sara');
    const joined = await joinOn(env, first.code);
    const asked = await askOn(env, joined.token);
    const answered = (await helperRoutes(
      new Request('https://relay.invalid/helper-answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: joined.token, id: asked.id, verdict: 'yes', note: null }),
      }),
      env,
    )) as Response;
    assert.equal(answered.status, 200);
    const stored = JSON.parse(kv.values.get(`question:${asked.id}`) ?? '{}') as { image: string | null };
    assert.equal(stored.image, null);
    const second = await askOn(env, joined.token);
    const cancelled = (await helperRoutes(
      new Request('https://relay.invalid/helper-cancel', {
        method: 'POST',
        headers: { authorization: 'Bearer test-code', 'content-type': 'application/json' },
        body: JSON.stringify({ id: second.id }),
      }),
      env,
    )) as Response;
    assert.equal(cancelled.status, 200);
    const dropped = JSON.parse(kv.values.get(`question:${second.id}`) ?? '{}') as { image: string | null };
    assert.equal(dropped.image, null);
    const third = await askOn(env, joined.token);
    now += PHOTO_TTL_MS + 1000;
    const gone = (await helperRoutes(
      new Request(`https://relay.invalid/helper-status?id=${third.id}`, { headers: { authorization: 'Bearer test-code' } }),
      env,
    )) as Response;
    assert.equal(gone.status, 404);
  } finally {
    resetHelpers();
  }
});

test('the full worker serves helpers from KV across requests', async () => {
  resetHelpers();
  try {
    const kv = fakeKv();
    const env = isolate(kv.binding);
    const pair = await worker.fetch(
      new Request('https://relay.invalid/helper-pair', {
        method: 'POST',
        headers: { authorization: 'Bearer test-code', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Sara' }),
      }),
      env,
    );
    assert.equal(pair.status, 200);
    const { code } = (await pair.json()) as { code: string };
    const join = await worker.fetch(
      new Request('https://relay.invalid/helper-join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
      env,
    );
    assert.equal(join.status, 200);
    const { token } = (await join.json()) as { token: string };
    const asked = await askOn(env, token);
    const status = await worker.fetch(
      new Request(`https://relay.invalid/helper-status?id=${asked.id}`, { headers: { authorization: 'Bearer test-code' } }),
      env,
    );
    assert.equal(status.status, 200);
    const body = (await status.json()) as { status: string };
    assert.equal(body.status, 'waiting');
  } finally {
    resetHelpers();
  }
});

test('codes expire after ten minutes on KV too', async () => {
  resetHelpers();
  try {
    const kv = fakeKv();
    const env = isolate(kv.binding);
    let now = Date.now();
    setHelperClock(() => now);
    const { code } = await pairOn(env, 'Sara');
    now += PAIR_TTL_MS + 1000;
    const joined = (await helperRoutes(
      new Request('https://relay.invalid/helper-join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      }),
      env,
    )) as Response;
    assert.equal(joined.status, 404);
  } finally {
    resetHelpers();
  }
});
