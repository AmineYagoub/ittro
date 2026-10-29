// Runs the real helper actors against a stubbed relay: pairing
// returns the code, and sending strips the crop to JPEG bytes with
// the question. A missing photo fails instead of sending blind.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor } from 'xstate';
import type { AnyActorLogic } from 'xstate';
import { pairHelper, sendHelp } from '../src/helper/actors';

const CROP = 'data:image/jpeg;base64,aGk=';

async function run<T>(logic: AnyActorLogic, input: Record<string, unknown>): Promise<T> {
  const actor = createActor(logic, { input });
  const finished = new Promise<T>((resolve, reject) => {
    actor.subscribe({
      next: (state) => {
        const status = (state as unknown as { status?: string }).status;
        if (status === 'done') {
          resolve((state as unknown as { output: T }).output);
        }
      },
      error: (err: unknown) => reject(err),
    });
  });
  actor.start();
  try {
    return await finished;
  } finally {
    actor.stop();
  }
}

test('pairing returns the relay code', async () => {
  const realFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? '{}'));
    return { ok: true, json: async () => ({ ok: true, code: '123456', expiresAt: 99 }) };
  }) as unknown as typeof fetch;
  try {
    const out = await run<{ name: string; code: string }>(pairHelper, { name: 'Sara' });
    assert.equal(out.code, '123456');
    assert.deepEqual(bodies, [{ name: 'Sara' }]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('sending strips the crop to JPEG bytes with the question', async () => {
  const realFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>);
    return { ok: true, json: async () => ({ ok: true, id: 'q1', helpers: ['Sara'] }) };
  }) as unknown as typeof fetch;
  try {
    const out = await run<{ id: string; helpers: string[]; photo: string | null }>(sendHelp, {
      tokens: ['tok1'],
      question: 'is this Masaad water',
      request: 'Masaad water',
      read: 'Masaad',
      crop: CROP,
    });
    assert.equal(out.id, 'q1');
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0]['image'], 'aGk=');
    assert.equal(bodies[0]['mime'], 'image/jpeg');
    assert.deepEqual(bodies[0]['tokens'], ['tok1']);
    assert.equal(out.photo, CROP);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('sending without any photo fails instead of sending blind', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return { ok: true, json: async () => ({ ok: true }) };
  }) as unknown as typeof fetch;
  try {
    await assert.rejects(
      run<unknown>(sendHelp, { tokens: ['tok1'], question: 'q', request: 'r', read: '', crop: null }),
      /no camera shot/,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
