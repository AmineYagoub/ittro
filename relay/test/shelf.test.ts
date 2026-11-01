import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyScene, pickPackagePhrase, readShelfLabels } from '../src/index.ts';

function okFetch(body: unknown): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
}

const completed = (obj: unknown): Record<string, unknown> => ({
  status: 'completed',
  output_text: JSON.stringify(obj),
});

const CROP = { id: 'shelf-0', image: 'aGk=', mime: 'image/jpeg' };

test('picks a short English package phrase', async () => {
  const phrase = await pickPackagePhrase(
    okFetch(completed({ phrase: 'rice bag' })),
    'https://example.invalid',
    'key',
    { request: 'Riz Basmati', image: 'aGk=', mime: 'image/jpeg' },
  );
  assert.equal(phrase, 'rice bag');
});

test('rejects an empty phrase instead of segmenting everything', async () => {
  await assert.rejects(
    pickPackagePhrase(okFetch(completed({ phrase: '  ' })), 'https://example.invalid', 'key', {
      request: 'water',
      image: 'aGk=',
      mime: 'image/jpeg',
    }),
    /schema gate/,
  );
});

test('reads one verdict per crop id', async () => {
  const result = await readShelfLabels(
    okFetch(
      completed({
        reads: [
          { id: 'shelf-0', brand_text: 'El Taaounia', size_text: 'Riz Basmati', verdict: 'yes', spoken: 'Riz Basmati' },
          { id: 'shelf-1', brand_text: 'El Taaounia', size_text: 'Riz blanc', verdict: 'no', spoken: 'Riz blanc' },
        ],
      }),
    ),
    'https://example.invalid',
    'key',
    {
      request: 'Riz Basmati',
      crops: [CROP, { id: 'shelf-1', image: 'aGk=', mime: 'image/jpeg' }],
    },
  );
  assert.equal(result.reads.length, 2);
  assert.equal(result.reads[0]?.verdict, 'yes');
  assert.equal(result.reads[1]?.verdict, 'no');
});

test('rejects reads that skip a crop id', async () => {
  await assert.rejects(
    readShelfLabels(
      okFetch(completed({ reads: [{ id: 'shelf-0', brand_text: null, size_text: null, verdict: 'unsure', spoken: '' }] })),
      'https://example.invalid',
      'key',
      { request: 'water', crops: [CROP, { id: 'shelf-1', image: 'aGk=', mime: 'image/jpeg' }] },
    ),
    /crop/,
  );
});

test('rejects reads that invent a crop id', async () => {
  await assert.rejects(
    readShelfLabels(
      okFetch(completed({ reads: [{ id: 'shelf-9', brand_text: null, size_text: null, verdict: 'unsure', spoken: '' }] })),
      'https://example.invalid',
      'key',
      { request: 'water', crops: [CROP] },
    ),
    /crop/,
  );
});

test('classifies a shelf scene with its kinds', async () => {
  const scene = await classifyScene(
    okFetch(completed({ scene: 'shelf', kinds: ['bags', 'jars'], aisle_hint: null, shelf_label: 'rice', fits_request: true })),
    'https://example.invalid',
    'key',
    { request: 'rice', image: 'aGk=', mime: 'image/jpeg' },
  );
  assert.equal(scene.scene, 'shelf');
  assert.deepEqual(scene.kinds, ['bags', 'jars']);
  assert.equal(scene.fits_request, true);
});

test('names the shelf in the shopper\'s language and says whether it holds the request', async () => {
  let sent = '';
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    sent = init.body;
    return { ok: true, json: async () => completed({ scene: 'shelf', kinds: ['boxes'], aisle_hint: null, shelf_label: 'البسكويت', fits_request: false }) };
  }) as unknown as typeof fetch;
  const scene = await classifyScene(fetchImpl, 'https://example.invalid', 'key', { request: 'أرز', image: 'aGk=', mime: 'image/jpeg', language: 'ar' });
  assert.equal(scene.shelf_label, 'البسكويت');
  assert.equal(scene.fits_request, false);
  assert.match(sent, /Shopper's language: ar/);
  assert.match(sent, /fits_request/);
});

test('a scene without the shelf fields is refused', async () => {
  await assert.rejects(
    classifyScene(
      okFetch(completed({ scene: 'shelf', kinds: ['bags'], aisle_hint: null })),
      'https://example.invalid',
      'key',
      { request: 'rice', image: 'aGk=', mime: 'image/jpeg' },
    ),
    /schema gate/,
  );
});

test('rejects a scene outside the enum instead of guessing', async () => {
  await assert.rejects(
    classifyScene(
      okFetch(completed({ scene: 'aisle', kinds: [], aisle_hint: null, shelf_label: null, fits_request: false })),
      'https://example.invalid',
      'key',
      { request: 'rice', image: 'aGk=', mime: 'image/jpeg' },
    ),
    /schema gate/,
  );
});

test('rejects a non-completed read instead of defaulting to unsure', async () => {
  await assert.rejects(
    readShelfLabels(okFetch({ status: 'incomplete', output_text: '{}' }), 'https://example.invalid', 'key', {
      request: 'water',
      crops: [CROP],
    }),
    /not completed/,
  );
});

test('a minimal read asks Meta with minimal effort', async () => {
  let effort = '';
  const record: typeof fetch = (async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as { body: string }).body)) as { reasoning: { effort: string } };
    effort = body.reasoning.effort;
    return {
      ok: true,
      json: async () =>
        completed({ reads: [{ id: 'shelf-0', brand_text: 'x', size_text: 'y', verdict: 'unsure', spoken: 'y' }] }),
    };
  }) as unknown as typeof fetch;
  await readShelfLabels(record, 'https://example.invalid', 'key', { request: 'water', crops: [CROP], effort: 'minimal' });
  assert.equal(effort, 'minimal');
});

// Shelf video, 1 Nov: "أرز أبيض" (white rice) read yes on Riz Basmati in
// three frames; the read must hold the shopper to the variety named.
test('the read prompt holds a named variety to the label', async () => {
  let system = '';
  const record: typeof fetch = (async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as { body: string }).body)) as { input: { role: string; content: string }[] };
    system = body.input.find((part) => part.role === 'system')?.content ?? '';
    return {
      ok: true,
      json: async () => completed({ reads: [{ id: 'shelf-0', brand_text: null, size_text: null, verdict: 'no', spoken: 'rice' }] }),
    };
  }) as unknown as typeof fetch;
  await readShelfLabels(record, 'https://example.invalid', 'key', { request: 'أرز أبيض', crops: [CROP] });
  assert.match(system, /label must name that same one/);
  assert.match(system, /Riz Basmati is no for white rice/);
});

test('a Muse Spark call asks Meta not to keep the photo', async () => {
  let sent: Record<string, unknown> = {};
  const capture = (async (_url: string, init: { body: string }) => {
    sent = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => completed({ phrase: 'bottle' }) };
  }) as unknown as typeof fetch;
  await pickPackagePhrase(capture, 'https://example.invalid', 'key', { request: 'water', image: 'aGk=', mime: 'image/jpeg' });
  assert.equal(sent['store'], false);
});
