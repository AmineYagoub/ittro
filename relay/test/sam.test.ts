import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineProducts } from '../src/index.ts';

function sseFetch(chunks: string[], status = 200): typeof fetch {
  const text = chunks.join('');
  return (async () =>
    status === 200
      ? { ok: true, status, text: async () => text }
      : { ok: false, status, text: async () => text }) as unknown as typeof fetch;
}

function delta(line: string): string {
  return `event: response.output_text.delta\ndata: ${JSON.stringify({ delta: line })}\n\n`;
}

function completed(): string {
  return `event: response.completed\ndata: ${JSON.stringify({ response: { status: 'completed' } })}\n\n`;
}

const LINE =
  '<0f>0<|box;x1=10;y1=20;x2=30;y2=40;w=100;h=200|><|mask;x=0;y=0;data=21,21,!abc|>' +
  ',2<|box;x1=50;y1=60;x2=70;y2=80;w=100;h=200|><|mask;x=0;y=0;data=21,21,!def|>';

test('parses boxes with sparse object ids', async () => {
  const result = await outlineProducts(
    sseFetch([delta(LINE), completed()]),
    'https://example.invalid',
    'key',
    { image: 'aGk=', mime: 'image/jpeg', phrase: 'bag' },
  );
  assert.equal(result.outlines.length, 2);
  assert.deepEqual(result.outlines[0], {
    id: 0,
    frame: 0,
    box: { x1: 10, y1: 20, x2: 30, y2: 40, w: 100, h: 200, confidence: null },
  });
  assert.equal(result.outlines[1]?.id, 2);
  assert.ok(result.samMs >= 0);
});

test('zero matches is an empty outline list, not an error', async () => {
  const result = await outlineProducts(sseFetch([completed()]), 'https://example.invalid', 'key', {
    image: 'aGk=',
    mime: 'image/jpeg',
    phrase: 'bottle',
  });
  assert.deepEqual(result.outlines, []);
});

test('reads confidence when the record carries it', async () => {
  const line =
    '<0f>1<|box;x1=1;y1=2;x2=3;y2=4;w=10;h=10;c=0.5|><|mask;x=0;y=0;c=0.5;data=3,3,!x|>';
  const result = await outlineProducts(
    sseFetch([delta(line), completed()]),
    'https://example.invalid',
    'key',
    { image: 'aGk=', mime: 'image/jpeg', phrase: 'bag' },
  );
  assert.equal(result.outlines[0]?.box.confidence, 0.5);
});

test('rejects a stream that never completes', async () => {
  await assert.rejects(
    outlineProducts(sseFetch([delta(LINE)]), 'https://example.invalid', 'key', {
      image: 'aGk=',
      mime: 'image/jpeg',
      phrase: 'bag',
    }),
    /not completed/,
  );
});

test('rejects a failed status instead of returning boxes', async () => {
  const failed =
    'event: response.completed\ndata: {"response":{"status":"failed"}}\n\n';
  await assert.rejects(
    outlineProducts(sseFetch([delta(LINE), failed]), 'https://example.invalid', 'key', {
      image: 'aGk=',
      mime: 'image/jpeg',
      phrase: 'bag',
    }),
    /not completed/,
  );
});

test('rejects a malformed line instead of guessing', async () => {
  await assert.rejects(
    outlineProducts(sseFetch([delta('<0f>oops'), completed()]), 'https://example.invalid', 'key', {
      image: 'aGk=',
      mime: 'image/jpeg',
      phrase: 'bag',
    }),
    /parse/,
  );
});

test('rejects an http error without retrying', async () => {
  await assert.rejects(
    outlineProducts(sseFetch(['busy'], 429), 'https://example.invalid', 'key', {
      image: 'aGk=',
      mime: 'image/jpeg',
      phrase: 'bag',
    }),
    /sam http 429/,
  );
});
