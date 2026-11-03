// One Meta call through the relay: success returns the body, and
// every failure carries its kind — down, limited or broken — so the
// statechart says each once.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { RELAY_TIMEOUT_MS, RelayError, getMeta, linkKindFor, postMeta } from '../src/metaCall';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function withFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
}

test('success returns the body', async () => {
  await withFetch((async () => jsonResponse(200, { ok: true, phrase: 'bag' })) as typeof fetch, async () => {
    const body = await postMeta<{ phrase: string }>('package-phrase', '/package-phrase', { request: 'x', image: 'y' });
    assert.equal(body.phrase, 'bag');
  });
});

test('a dead route is down', async () => {
  await withFetch((async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch, async () => {
    const error = await postMeta('outline', '/outline', {}).catch((err: unknown) => err);
    assert.ok(error instanceof RelayError);
    assert.equal(error.kind, 'down');
    assert.equal(linkKindFor(error), 'down');
  });
});

test('429 and 402 are limited', async () => {
  for (const status of [429, 402]) {
    await withFetch((async () => jsonResponse(status, { ok: false, error: 'slow down' })) as typeof fetch, async () => {
      const error = await getMeta('helper-status', '/helper-status?id=x').catch((err: unknown) => err);
      assert.ok(error instanceof RelayError);
      assert.equal(error.kind, 'limited');
      assert.equal(error.status, status);
    });
  }
});

test('bad answers are broken, never silent defaults', async () => {
  await withFetch((async () => jsonResponse(502, { ok: false, error: 'model down' })) as typeof fetch, async () => {
    const error = await postMeta('understand', '/understand', {}).catch((err: unknown) => err);
    assert.ok(error instanceof RelayError);
    assert.equal(error.kind, 'broken');
  });
  await withFetch((async () => new Response('not json', { status: 200 })) as typeof fetch, async () => {
    const error = await postMeta('understand', '/understand', {}).catch((err: unknown) => err);
    assert.ok(error instanceof RelayError);
    assert.equal(error.kind, 'broken');
  });
  assert.equal(linkKindFor(new Error('plain')), 'broken');
});

test('an answer that stops halfway is down after the deadline, never a wait forever', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const stalled = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"ok":'));
    },
  });
  try {
    await withFetch((async () => new Response(stalled, { status: 200 })) as typeof fetch, async () => {
      let error: unknown = null;
      const call = postMeta('find', '/find', {}).catch((err: unknown) => {
        error = err;
      });
      await new Promise((done) => setImmediate(done));
      mock.timers.tick(RELAY_TIMEOUT_MS);
      await Promise.race([call, new Promise((done) => setImmediate(done))]);
      assert.ok(error instanceof RelayError);
      assert.equal(error.kind, 'down');
    });
  } finally {
    mock.timers.reset();
  }
});
