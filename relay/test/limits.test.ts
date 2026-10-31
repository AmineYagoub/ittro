import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

function memoryKv(): Map<string, string> {
  return new Map();
}

function kvOf(store: Map<string, string>): {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
} {
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const CODE = 'test-code-123';

function gatedRequest(code: string): Request {
  return new Request('http://relay/understand', {
    method: 'POST',
    headers: { authorization: `Bearer ${code}` },
    body: JSON.stringify({ transcript: 'hello' }),
  });
}

test('unknown app gets 401, never the model', async () => {
  const res = await worker.fetch(gatedRequest('wrong'), { APP_ACCESS_CODE: CODE });
  assert.equal(res.status, 401);
});

test('missing code gets 401', async () => {
  const req = new Request('http://relay/understand', { method: 'POST', body: '{}' });
  const res = await worker.fetch(req, { APP_ACCESS_CODE: CODE });
  assert.equal(res.status, 401);
});

test('removed probe routes stay gone', async () => {
  for (const path of ['/spark', '/transcribe']) {
    const res = await worker.fetch(
      new Request(`http://relay${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${CODE}` },
        body: '{}',
      }),
      { APP_ACCESS_CODE: CODE },
    );
    assert.equal(res.status, 404);
  }
});

test('one visitor cannot flood: 31st call in a minute gets 429', async () => {
  const store = memoryKv();
  const env = { APP_ACCESS_CODE: CODE, ITTRO_LIMITS: kvOf(store), RATE_LIMIT_PER_MINUTE: '30' };
  for (let i = 0; i < 30; i += 1) {
    const res = await worker.fetch(gatedRequest(CODE), env);
    assert.notEqual(res.status, 429);
  }
  const flooded = await worker.fetch(gatedRequest(CODE), env);
  assert.equal(flooded.status, 429);
});

test('rate counts sum across shards and the legacy key', async () => {
  const store = memoryKv();
  const minute = Math.floor(Date.now() / 60000);
  store.set(`rl:unknown:${minute}:0`, '28');
  store.set(`rl:unknown:${minute}:2`, '1');
  store.set(`rl:unknown:${minute}`, '1');
  const env = { APP_ACCESS_CODE: CODE, ITTRO_LIMITS: kvOf(store), RATE_LIMIT_PER_MINUTE: '30' };
  const res = await worker.fetch(gatedRequest(CODE), env);
  assert.equal(res.status, 429);
});

test('spending stops for the day at the limit', async () => {
  const store = memoryKv();
  const day = new Date().toISOString().slice(0, 10);
  store.set(`spend:${day}`, '2.999');
  const env = { APP_ACCESS_CODE: CODE, ITTRO_LIMITS: kvOf(store), DAILY_BUDGET_USD: '3', SPARK_COST_USD: '0.01' };
  const res = await worker.fetch(gatedRequest(CODE), env);
  assert.equal(res.status, 402);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? '', /daily budget/);
});

test('spend sums shards and the legacy key', async () => {
  const store = memoryKv();
  const day = new Date().toISOString().slice(0, 10);
  store.set(`spend:${day}:1`, '2.0');
  store.set(`spend:${day}:3`, '1.5');
  const env = { APP_ACCESS_CODE: CODE, ITTRO_LIMITS: kvOf(store), DAILY_BUDGET_USD: '3', SPARK_COST_USD: '0.01' };
  const res = await worker.fetch(gatedRequest(CODE), env);
  assert.equal(res.status, 402);
});

test('budget errors differ from network errors', async () => {
  const store = memoryKv();
  const env = { APP_ACCESS_CODE: CODE, ITTRO_LIMITS: kvOf(store), DAILY_BUDGET_USD: '3' };
  const res = await worker.fetch(gatedRequest(CODE), env);
  assert.equal(res.status, 502);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? '', /relay not configured/);
});
