import test from 'node:test';
import assert from 'node:assert/strict';
import { askView, isViewAnswer } from '../src/index.ts';
import { askFields } from '../src/bodies.ts';

interface Sent {
  store: unknown;
  system: string;
  facts: Record<string, unknown>;
  image: string;
}

function spark(view: unknown, status = 'completed'): { fetchImpl: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { store: unknown; input: [{ content: string }, { content: Array<{ text?: string; image_url?: string }> }] };
    sent.push({
      store: body.store,
      system: body.input[0].content,
      facts: JSON.parse(body.input[1].content[0]?.text ?? '{}') as Record<string, unknown>,
      image: body.input[1].content[1]?.image_url ?? '',
    });
    return { ok: true, json: async () => ({ status, output_text: JSON.stringify(view) }) };
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

const HINTS = { language: 'ar' as const, history: [], inventory: ['Riz blanc'], upset: false, brief: false };

test('answers a question from the still, with the rules and the hints', async () => {
  const { fetchImpl, sent } = spark({ answer: 'على هذا الرف أرى أرز أبيض وأرز بسمتي.', offer: null, unreadable: [] });
  const result = await askView(fetchImpl, 'https://example.invalid', 'key', { ...HINTS, question: 'شنو كاين هنا؟', wanted: null, image: 'aGk=', mime: 'image/jpeg' });
  assert.equal(result.view.answer, 'على هذا الرف أرى أرز أبيض وأرز بسمتي.');
  assert.equal(sent[0]?.store, false);
  assert.match(sent[0]?.system ?? '', /Never guess/);
  assert.doesNotMatch(sent[0]?.system ?? '', /without finding it/);
  assert.deepEqual(sent[0]?.facts['inventory'], ['Riz blanc']);
  assert.equal(sent[0]?.image, 'data:image/jpeg;base64,aGk=');
});

test('the not-here summary asks with the product that was not found', async () => {
  const { fetchImpl, sent } = spark({ answer: 'لا أرى بسمتي على هذا الرف. أرى أرز أبيض.', offer: 'أرز أبيض', unreadable: [] });
  const result = await askView(fetchImpl, 'https://example.invalid', 'key', { ...HINTS, question: null, wanted: 'بسمتي', image: 'aGk=', mime: 'image/jpeg' });
  assert.equal(result.view.offer, 'أرز أبيض');
  assert.match(sent[0]?.system ?? '', /without finding it/);
  assert.equal(sent[0]?.facts['wanted'], 'بسمتي');
});

test('an empty answer or an unfinished response is an error, never silence', async () => {
  const empty = spark({ answer: '  ', offer: null, unreadable: [] });
  await assert.rejects(askView(empty.fetchImpl, 'https://example.invalid', 'key', { ...HINTS, question: 'what is here?', wanted: null, image: 'aGk=', mime: 'image/jpeg' }), /schema gate/);
  const cut = spark({ answer: 'x', offer: null, unreadable: [] }, 'incomplete');
  await assert.rejects(askView(cut.fetchImpl, 'https://example.invalid', 'key', { ...HINTS, question: 'what is here?', wanted: null, image: 'aGk=', mime: 'image/jpeg' }), /not completed/);
});

test('a question needs words or the product not found', async () => {
  const { fetchImpl } = spark({ answer: 'x', offer: null, unreadable: [] });
  await assert.rejects(askView(fetchImpl, 'https://example.invalid', 'key', { ...HINTS, question: null, wanted: null, image: 'aGk=', mime: 'image/jpeg' }), /needs a question/);
});

test('the answer gate refuses long answers and empty offers', () => {
  assert.equal(isViewAnswer({ answer: 'x'.repeat(401), offer: null, unreadable: [] }), false);
  assert.equal(isViewAnswer({ answer: 'ok', offer: ' ', unreadable: [] }), false);
  assert.equal(isViewAnswer({ answer: 'ok', offer: 'Riz blanc', unreadable: ['price'] }), true);
});

test('the hints are capped and malformed turns dropped', () => {
  const hints = askFields({
    language: 'xx',
    history: [{ shopper: 'a', ittro: 'b' }, { shopper: 'c' }, 'd', { shopper: 'e', ittro: 'f' }, { shopper: 'g', ittro: 'h' }, { shopper: 'i', ittro: 'j' }, { shopper: 'k', ittro: 'l' }],
    inventory: ['Riz blanc', 3, '', ...Array.from({ length: 20 }, (_, at) => `p${at}`)],
    upset: 'yes',
    brief: true,
  });
  assert.equal(hints.language, 'en');
  assert.deepEqual(hints.history.map((turn) => turn.shopper), ['e', 'g', 'i', 'k']);
  assert.equal(hints.inventory.length, 12);
  assert.equal(hints.inventory[0], 'Riz blanc');
  assert.equal(hints.upset, false);
  assert.equal(hints.brief, true);
});
