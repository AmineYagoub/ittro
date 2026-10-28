import test from 'node:test';
import assert from 'node:assert/strict';
import { understandUtterance } from '../src/index.ts';

interface StubResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

const completed = (obj: unknown): Record<string, unknown> => ({ status: 'completed', output_text: JSON.stringify(obj) });
const okFetch =
  (body: unknown): ((url: string, init?: unknown) => Promise<StubResponse>) =>
  async () => ({ ok: true, json: async () => body });

const context = {
  transcript: "I'm looking for Masaad water",
  language: 'en',
  step: 'welcome',
  pending_question: null,
  pending_request: null,
};

const answer = {
  intent: 'request_product',
  language_spoken: 'en',
  product_text: 'Masaad water',
  items: null,
  detail: null,
  target_language: null,
  helper_name: null,
};

test('understands a product request', async () => {
  const parsed = await understandUtterance(
    okFetch(completed(answer)) as unknown as typeof fetch,
    'https://example.invalid',
    'key',
    context,
  );
  assert.equal(parsed.intent, 'request_product');
  assert.equal(parsed.product_text, 'Masaad water');
});

test('rejects a non-completed status instead of defaulting', async () => {
  await assert.rejects(
    understandUtterance(
      okFetch({ status: 'incomplete', output_text: '{}' }) as unknown as typeof fetch,
      'https://example.invalid',
      'key',
      context,
    ),
    /not completed/,
  );
});

test('rejects schema violations (unknown intent)', async () => {
  await assert.rejects(
    understandUtterance(
      okFetch(completed({ ...answer, intent: 'teleport' })) as unknown as typeof fetch,
      'https://example.invalid',
      'key',
      context,
    ),
    /schema gate/,
  );
});

test('sends the transcript with the strict understand schema', async () => {
  let sent: Record<string, unknown> = {};
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => completed(answer) };
  }) as unknown as typeof fetch;
  await understandUtterance(capture, 'https://example.invalid', 'key', context);
  const format = sent['text'] as Record<string, Record<string, unknown>>;
  assert.equal(format['format']['strict'], true);
  assert.equal(format['format']['name'], 'understand_utterance');
  const input = JSON.stringify(sent['input']);
  assert.match(input, /Masaad water/);
});

test('passes minimal effort and the last line through', async () => {
  let sent: Record<string, unknown> = {};
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => completed(answer) };
  }) as unknown as typeof fetch;
  await understandUtterance(capture, 'https://example.invalid', 'key', {
    ...context,
    last_line: 'Is that right? Say yes or no.',
    effort: 'minimal',
  });
  assert.equal((sent['reasoning'] as Record<string, unknown>)['effort'], 'minimal');
  assert.match(JSON.stringify(sent['input']), /Is that right/);
});

test('unknown effort falls back to low', async () => {
  let sent: Record<string, unknown> = {};
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => completed(answer) };
  }) as unknown as typeof fetch;
  await understandUtterance(capture, 'https://example.invalid', 'key', { ...context, effort: 'ultra' });
  assert.equal((sent['reasoning'] as Record<string, unknown>)['effort'], 'low');
});

test('product names keep one script and translate on request', async () => {
  let sent: Record<string, unknown> = {};
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => completed(answer) };
  }) as unknown as typeof fetch;
  await understandUtterance(capture, 'https://example.invalid', 'key', context);
  const input = JSON.stringify(sent['input']);
  assert.match(input, /Never mix scripts within a name/);
  assert.match(input, /In step translate, restate/);
});

test('correction rule pins confirm_no with the combined text', async () => {
  let sent: Record<string, unknown> = {};
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => completed(answer) };
  }) as unknown as typeof fetch;
  await understandUtterance(capture, 'https://example.invalid', 'key', {
    ...context,
    pending_request: 'Masaad water',
  });
  assert.match(JSON.stringify(sent['input']), /correction of pending_request is confirm_no/);
});
