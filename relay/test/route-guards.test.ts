// The guards every photo route shares: a Meta call is charged to the
// day's spend even when its answer is refused, text bound for a prompt
// is capped, and a body that is not a JSON object is a 400, never an
// uncaught throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { spendTodayUsd } from '../src/index.ts';

const CODE = 'test-code-123';

function kvOf(store: Map<string, string>) {
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function envWith(store: Map<string, string>) {
  return { APP_ACCESS_CODE: CODE, ITTRO_LIMITS: kvOf(store), META_API_BASE: 'https://example.invalid', META_API_KEY: 'key', SPARK_COST_USD: '0.01' };
}

function post(path: string, body: unknown): Request {
  return new Request(`http://relay${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${CODE}` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function withMeta<T>(output: unknown, sent: string[], run: () => Promise<T>): Promise<T> {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent.push(init.body);
    return new Response(JSON.stringify({ status: 'completed', output_text: JSON.stringify(output) }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = saved;
  }
}

test('a Meta call whose answer is refused is still charged', async () => {
  const store = new Map<string, string>();
  const env = envWith(store);
  const sent: string[] = [];
  const res = await withMeta({ answer: 7, offer: null, unreadable: [] }, sent, () => worker.fetch(post('/ask-view', { image: 'aGk=', question: 'what is here?' }), env as never));
  assert.equal(res.status, 502);
  assert.equal(sent.length, 1);
  assert.ok((await spendTodayUsd(env as never)) >= 0.01 - 1e-9);
});

test('a question and a transcript are capped before they reach Meta', async () => {
  const store = new Map<string, string>();
  const sent: string[] = [];
  const big = 'what is on this shelf? '.repeat(50000);
  await withMeta({ answer: 'On this shelf I see rice.', offer: null, unreadable: [] }, sent, () =>
    worker.fetch(post('/ask-view', { image: 'aGk=', question: big, wanted: big }), envWith(store) as never),
  );
  assert.ok((sent[0]?.length ?? 0) < 20000, `the call carried ${sent[0]?.length} characters`);
  const said: string[] = [];
  await withMeta({ intent: 'not_understood' }, said, () => worker.fetch(post('/understand', { transcript: big }), envWith(store) as never));
  assert.ok((said[0]?.length ?? 0) < 20000, `the call carried ${said[0]?.length} characters`);
});

test('a body that is not a JSON object is a 400 on every photo route', async () => {
  for (const path of ['/understand', '/ask-view', '/find', '/outline', '/package-phrase', '/read-shelf', '/classify-scene', '/confirm-hand', '/read-detail']) {
    for (const body of ['not json', 'null', '[1]']) {
      const res = await worker.fetch(post(path, body), envWith(new Map()) as never);
      assert.equal(res.status, 400, `${path} with ${body}`);
    }
  }
});
