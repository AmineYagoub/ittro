import test from 'node:test';
import assert from 'node:assert/strict';
import { understandUtterance, understandWithStill } from '../src/index.ts';

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
  question: null,
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

test('accepts the ignore intent for background talk', async () => {
  const parsed = await understandUtterance(
    okFetch(completed({ ...answer, intent: 'ignore' })) as unknown as typeof fetch,
    'https://example.invalid',
    'key',
    context,
  );
  assert.equal(parsed.intent, 'ignore');
});

test('background talk that is not addressed to Ittro is ignore', async () => {
  let sent: Record<string, unknown> = {};
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => completed(answer) };
  }) as unknown as typeof fetch;
  await understandUtterance(capture, 'https://example.invalid', 'key', context);
  assert.match(JSON.stringify(sent['input']), /not addressed to Ittro is ignore/);
});

test('a brand or product name alone is never ignore', async () => {
  let sent: Record<string, unknown> = {};
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => completed(answer) };
  }) as unknown as typeof fetch;
  await understandUtterance(capture, 'https://example.invalid', 'key', context);
  assert.match(JSON.stringify(sent['input']), /always meant for Ittro and never ignore/);
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

test('a question with a still is understood and answered in one call', async () => {
  let sent: { system: string; content: Array<{ type: string; text?: string; image_url?: string }> } | null = null;
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { input: [{ content: string }, { content: Array<{ type: string; text?: string; image_url?: string }> }] };
    sent = { system: body.input[0].content, content: body.input[1].content };
    return {
      ok: true,
      json: async () =>
        completed({ ...answer, intent: 'ask_view', question: 'is there honey?', answer: 'إيه، كاين عسل في الرف التحتاني.', offer: 'عسلة مدينة', unreadable: [] }),
    };
  }) as unknown as typeof fetch;
  const result = await understandWithStill(fetchImpl, 'https://example.invalid', 'key', context, {
    image: 'aGk=',
    mime: 'image/jpeg',
    language: 'ar',
    history: [],
    inventory: [],
    upset: false,
    brief: false,
  });
  assert.equal(result.intent, 'ask_view');
  assert.deepEqual(result.view, { answer: 'إيه، كاين عسل في الرف التحتاني.', offer: 'عسلة مدينة', unreadable: [] });
  assert.equal((result as unknown as Record<string, unknown>)['answer'], undefined);
  const call = sent as unknown as { system: string; content: Array<{ type: string; image_url?: string }> };
  assert.match(call.system, /ask_view is a question about what the camera sees/);
  assert.match(call.system, /Never guess/);
  assert.equal(call.content[1]?.image_url, 'data:image/jpeg;base64,aGk=');
});

test('any other intent with a still carries no view answer', async () => {
  const fetchImpl = okFetch(completed({ ...answer, answer: '', offer: null, unreadable: [] }));
  const result = await understandWithStill(fetchImpl as unknown as typeof fetch, 'https://example.invalid', 'key', context, {
    image: 'aGk=',
    mime: 'image/jpeg',
    language: 'en',
    history: [],
    inventory: [],
    upset: false,
    brief: false,
  });
  assert.equal(result.intent, 'request_product');
  assert.equal(result.view, null);
});
