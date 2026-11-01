import test from 'node:test';
import assert from 'node:assert/strict';
import { findOnShelf } from '../src/index.ts';

// Two cut outlines, as in sam.test.ts.
const BOX_ONE =
  '1<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>' +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>";
const BOX_TWO =
  '2<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>' +
  '<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>';

function sse(line: string): string {
  return (
    `event: response.output_text.delta\ndata: ${JSON.stringify({ delta: line })}\n\n` +
    `event: response.completed\ndata: ${JSON.stringify({ response: { status: 'completed' } })}\n\n`
  );
}

interface Sent {
  model: string;
  store: unknown;
  text: string;
}

// Muse Spark answers the grounding, SAM the box prompt; every request is kept.
function meta(items: unknown[], samLine: string): { fetchImpl: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { model: string; store: unknown; input: Array<{ content: Array<{ text?: string }> }> };
    sent.push({ model: body.model, store: body.store, text: body.input[0]?.content[0]?.text ?? '' });
    if (body.model === 'sam-3.1') {
      return { ok: true, status: 200, text: async () => sse(samLine) };
    }
    return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({ items }) }) };
  }) as unknown as typeof fetch;
  return { fetchImpl, sent };
}

const PHOTO = { request: 'ماء قديلة', image: 'aGk=', mime: 'image/jpeg', w: 320, h: 334 };

test('boxes the requested product, then SAM cuts exactly those boxes', async () => {
  const { fetchImpl, sent } = meta(
    [
      { box: [50, 50, 500, 500], label: 'Guedila', is_requested: true },
      { box: [550, 50, 950, 500], label: 'Ifri', is_requested: false },
      { box: [550, 50, 950, 500], label: 'Guedila', is_requested: true },
    ],
    `<0f>${BOX_ONE},${BOX_TWO}`,
  );
  const result = await findOnShelf(fetchImpl, 'https://example.invalid', 'key', PHOTO);
  assert.deepEqual(sent.map((call) => call.model), ['muse-spark-1.3', 'sam-3.1']);
  assert.ok(sent[0]?.text.includes('«ماء قديلة»'));
  assert.equal(
    sent[1]?.text,
    '<0f>1<|box;x1=16;y1=17;x2=160;y2=167;w=320;h=334|>,2<|box;x1=176;y1=17;x2=304;y2=167;w=320;h=334|>',
  );
  assert.deepEqual(
    result.outlines.map((outline) => [outline.label, outline.box.x1]),
    [
      ['Guedila', 211],
      ['Guedila', 155],
    ],
  );
});

test('nothing requested in view: no SAM call, no outline', async () => {
  const { fetchImpl, sent } = meta([{ box: [50, 50, 500, 500], label: 'Ifri', is_requested: false }], '');
  const result = await findOnShelf(fetchImpl, 'https://example.invalid', 'key', PHOTO);
  assert.equal(sent.length, 1);
  assert.equal(result.outlines.length, 0);
  assert.equal(result.samMs, 0);
});

test('a box outside the photo or turned inside out is dropped', async () => {
  const { fetchImpl, sent } = meta(
    [
      { box: [500, 500, 400, 600], label: 'Guedila', is_requested: true },
      { box: [10, 20], label: 'Guedila', is_requested: true },
    ],
    '',
  );
  const result = await findOnShelf(fetchImpl, 'https://example.invalid', 'key', PHOTO);
  assert.equal(sent.length, 1);
  assert.equal(result.outlines.length, 0);
});

test('both calls ask Meta not to keep the photo', async () => {
  const { fetchImpl, sent } = meta([{ box: [50, 50, 500, 500], label: 'Guedila', is_requested: true }], `<0f>${BOX_ONE}`);
  await findOnShelf(fetchImpl, 'https://example.invalid', 'key', PHOTO);
  assert.deepEqual(sent.map((call) => call.store), [false, false]);
});

test('a grounding answer outside the schema is an error, never an empty shelf', async () => {
  const { fetchImpl } = meta([{ box: [1, 2, 3, 4], label: 'Guedila' }], '');
  await assert.rejects(findOnShelf(fetchImpl, 'https://example.invalid', 'key', PHOTO), /schema gate/);
});
