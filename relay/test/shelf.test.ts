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
    okFetch(completed({ scene: 'shelf', kinds: ['bags', 'jars'], aisle_hint: null })),
    'https://example.invalid',
    'key',
    { request: 'rice', image: 'aGk=', mime: 'image/jpeg' },
  );
  assert.equal(scene.scene, 'shelf');
  assert.deepEqual(scene.kinds, ['bags', 'jars']);
});

test('rejects a scene outside the enum instead of guessing', async () => {
  await assert.rejects(
    classifyScene(
      okFetch(completed({ scene: 'aisle', kinds: [], aisle_hint: null })),
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
