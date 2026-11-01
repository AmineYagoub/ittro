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

const PHOTO = { image: 'aGk=', mime: 'image/jpeg', phrase: 'button', w: 320, h: 334 };

const FIRST =
  '0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>' +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>";

const SECOND =
  '1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>' +
  '<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>';

const LINE = `<0f>${FIRST},${SECOND}`;

function insideBox(points: number[], box: { x1: number; y1: number; x2: number; y2: number }): boolean {
  for (let at = 0; at + 1 < points.length; at += 2) {
    const x = points[at] as number;
    const y = points[at + 1] as number;
    if (x < box.x1 || x > box.x2 + 1 || y < box.y1 || y > box.y2 + 1) {
      return false;
    }
  }
  return true;
}

test('parses boxes with sparse object ids', async () => {
  const sparse = `<0f>${FIRST},${SECOND.replace(/^1<\|box/, '2<|box')}`;
  const result = await outlineProducts(sseFetch([delta(sparse), completed()]), 'https://example.invalid', 'key', PHOTO);
  assert.equal(result.outlines.length, 2);
  assert.deepEqual(result.outlines[0]?.box, {
    x1: 211,
    y1: 228,
    x2: 270,
    y2: 254,
    w: 320,
    h: 334,
    confidence: null,
  });
  assert.equal(result.outlines[1]?.id, 2);
  assert.ok(result.samMs >= 0);
  assert.ok(result.maskMs >= 0);
});

test('each outline carries a small polygon inside its box', async () => {
  const result = await outlineProducts(sseFetch([delta(LINE), completed()]), 'https://example.invalid', 'key', PHOTO);
  for (const outline of result.outlines) {
    const points = outline.mask?.points ?? [];
    assert.ok(points.length >= 6);
    assert.equal(points.length % 2, 0);
    assert.ok(points.length / 2 <= 48);
    assert.ok(insideBox(points, outline.box));
  }
});

test('zero matches is an empty outline list, not an error', async () => {
  const result = await outlineProducts(sseFetch([completed()]), 'https://example.invalid', 'key', PHOTO);
  assert.deepEqual(result.outlines, []);
});

test('reads confidence when the record carries it', async () => {
  const confident = `<0f>${FIRST.replace('w=320;h=334|>', 'w=320;h=334;c=0.5|>')}`;
  const result = await outlineProducts(sseFetch([delta(confident), completed()]), 'https://example.invalid', 'key', PHOTO);
  assert.equal(result.outlines[0]?.box.confidence, 0.5);
});

test('rejects a stream that never completes', async () => {
  await assert.rejects(
    outlineProducts(sseFetch([delta(LINE)]), 'https://example.invalid', 'key', PHOTO),
    /not completed/,
  );
});

test('rejects a failed status instead of returning boxes', async () => {
  const failed = 'event: response.completed\ndata: {"response":{"status":"failed"}}\n\n';
  await assert.rejects(
    outlineProducts(sseFetch([delta(LINE), failed]), 'https://example.invalid', 'key', PHOTO),
    /not completed/,
  );
});

test('rejects a refusal instead of returning boxes', async () => {
  const refused = 'event: response.refusal.done\ndata: {"refusal":"no"}\n\n';
  await assert.rejects(
    outlineProducts(sseFetch([refused]), 'https://example.invalid', 'key', PHOTO),
    /refused/,
  );
});

test('rejects a malformed line instead of guessing', async () => {
  await assert.rejects(
    outlineProducts(sseFetch([delta('<0f>oops'), completed()]), 'https://example.invalid', 'key', PHOTO),
    /parse/,
  );
});

test('rejects chatter without outlines instead of calling it empty', async () => {
  await assert.rejects(
    outlineProducts(sseFetch([delta('here are your products'), completed()]), 'https://example.invalid', 'key', PHOTO),
    /parse/,
  );
});

test('rejects a box outside the photo instead of clamping it', async () => {
  const outside = `<0f>${FIRST.replace('x1=211', 'x1=319').replace('x2=270', 'x2=400')}`;
  await assert.rejects(
    outlineProducts(sseFetch([delta(outside), completed()]), 'https://example.invalid', 'key', PHOTO),
    /parse/,
  );
});

test('rejects a missing photo size instead of guessing it', async () => {
  await assert.rejects(
    outlineProducts(sseFetch([completed()]), 'https://example.invalid', 'key', { ...PHOTO, w: 0 }),
    /photo size/,
  );
});

test('rejects an http error without retrying', async () => {
  await assert.rejects(outlineProducts(sseFetch(['busy'], 429), 'https://example.invalid', 'key', PHOTO), /sam http 429/);
});

test('a SAM call asks Meta not to keep the photo', async () => {
  let sent: Record<string, unknown> = {};
  const text = [delta(LINE), completed()].join('');
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, status: 200, text: async () => text };
  }) as unknown as typeof fetch;
  await outlineProducts(capture, 'https://example.invalid', 'key', PHOTO);
  assert.equal(sent['store'], false);
});
