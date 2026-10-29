// One Meta call through the relay: success returns the body, and
// every failure carries its kind — down, limited or broken — so the
// statechart says each once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RelayError, getMeta, linkKindFor, postMeta } from '../src/metaCall';

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
