import test from 'node:test';
import assert from 'node:assert/strict';
import { callSpark } from '../src/index.ts';

interface StubResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

const completed = (obj: unknown): Record<string, unknown> => ({ status: 'completed', output_text: JSON.stringify(obj) });
const okFetch =
  (body: unknown): ((url: string, init?: unknown) => Promise<StubResponse>) =>
  async () => ({ ok: true, json: async () => body });

const base = { apiBase: 'https://example.invalid', apiKey: 'test', input: 'confirm' };

test('accepts a completed, parsable yes', async () => {
  const answer = await callSpark({
    ...base,
    fetchImpl: okFetch(completed({ verdict: 'yes', spoken_summary: 'Found it.', label_text: 'Milk 1L' })) as unknown as typeof fetch,
  });
  assert.equal(answer.verdict, 'yes');
});

test('rejects a non-completed status instead of defaulting', async () => {
  await assert.rejects(
    callSpark({
      ...base,
      fetchImpl: okFetch({ status: 'incomplete', output_text: '{}' }) as unknown as typeof fetch,
    }),
    /not completed/,
  );
});

test('rejects broken JSON instead of defaulting', async () => {
  await assert.rejects(
    callSpark({
      ...base,
      fetchImpl: okFetch({ status: 'completed', output_text: 'not json' }) as unknown as typeof fetch,
    }),
    /not valid JSON/,
  );
});

test('rejects refusal-shaped answers instead of mapping to unsure', async () => {
  await assert.rejects(
    callSpark({
      ...base,
      fetchImpl: okFetch({ status: 'refused', output_text: '{}' }) as unknown as typeof fetch,
    }),
    /not completed/,
  );
});

test('rejects schema violations (bad verdict)', async () => {
  await assert.rejects(
    callSpark({
      ...base,
      fetchImpl: okFetch(completed({ verdict: 'maybe', spoken_summary: 'x', label_text: null })) as unknown as typeof fetch,
    }),
    /schema gate/,
  );
});
