// The in-hand confirm and detail reads: a yes carries every asked
// attribute matched, a no names a contradiction, an unsure lists
// what could not be read, and a picture problem is never a doubt.
// Anything that breaks those rules is rejected, never defaulted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmInHand, confirmRoute, detailRoute, readLabelDetail } from '../src/index.ts';

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

const PHOTO = { request: 'El Taaounia Riz Basmati 1 kg', image: 'aGk=', mime: 'image/jpeg' };

const ASKED = { brand: 'El Taaounia', product: 'Riz', variant: 'Basmati', size: '1 kg' };

test('a yes carries every asked attribute read and matched', async () => {
  const result = await confirmInHand(okFetch(completed({
    verdict: 'yes',
    picture_problem: null,
    asked: ASKED,
    read: { brand: 'El Taaounia', product: 'Riz', variant: 'Basmati', size: '1 kg' },
    label_name: 'El Taaounia Riz Basmati, 1 kg',
    unreadable: [],
  })), 'https://example.invalid', 'key', PHOTO);
  assert.equal(result.read.verdict, 'yes');
  assert.equal(result.read.label_name, 'El Taaounia Riz Basmati, 1 kg');
});

test('a yes with anything unreadable is rejected, never a guess', async () => {
  await assert.rejects(
    confirmInHand(okFetch(completed({
      verdict: 'yes',
      picture_problem: null,
      asked: ASKED,
      read: { brand: 'El Taaounia', product: 'Riz', variant: 'Basmati', size: null },
      label_name: 'El Taaounia Riz Basmati',
      unreadable: ['size'],
    })), 'https://example.invalid', 'key', PHOTO),
    /schema gate/,
  );
});

test('a no names the held product when the variant contradicts', async () => {
  const result = await confirmInHand(okFetch(completed({
    verdict: 'no',
    picture_problem: null,
    asked: ASKED,
    read: { brand: 'El Taaounia', product: 'Riz', variant: 'blanc', size: '1 kg' },
    label_name: 'El Taaounia Riz blanc',
    unreadable: [],
  })), 'https://example.invalid', 'key', PHOTO);
  assert.equal(result.read.verdict, 'no');
  assert.equal(result.read.read.variant, 'blanc');
});

test('an unsure lists what was and was not read', async () => {
  const result = await confirmInHand(okFetch(completed({
    verdict: 'unsure',
    picture_problem: null,
    asked: ASKED,
    read: { brand: 'El Taaounia', product: null, variant: null, size: null },
    label_name: 'El Taaounia',
    unreadable: ['product', 'variant', 'size'],
  })), 'https://example.invalid', 'key', PHOTO);
  assert.equal(result.read.verdict, 'unsure');
  assert.deepEqual(result.read.unreadable, ['product', 'variant', 'size']);
});

test('a picture verdict names the problem, never a doubt', async () => {
  const result = await confirmInHand(okFetch(completed({
    verdict: 'picture',
    picture_problem: 'turned',
    asked: ASKED,
    read: { brand: null, product: null, variant: null, size: null },
    label_name: '',
    unreadable: ['brand', 'product', 'variant', 'size'],
  })), 'https://example.invalid', 'key', PHOTO);
  assert.equal(result.read.verdict, 'picture');
  assert.equal(result.read.picture_problem, 'turned');
});

test('a picture without a problem is rejected', async () => {
  await assert.rejects(
    confirmInHand(okFetch(completed({
      verdict: 'picture',
      picture_problem: null,
      asked: ASKED,
      read: { brand: null, product: null, variant: null, size: null },
      label_name: '',
      unreadable: ['brand'],
    })), 'https://example.invalid', 'key', PHOTO),
    /schema gate/,
  );
});

test('a doubt with a picture problem is rejected', async () => {
  await assert.rejects(
    confirmInHand(okFetch(completed({
      verdict: 'unsure',
      picture_problem: 'blurry',
      asked: ASKED,
      read: { brand: 'El Taaounia', product: null, variant: null, size: null },
      label_name: 'El Taaounia',
      unreadable: ['product'],
    })), 'https://example.invalid', 'key', PHOTO),
    /schema gate/,
  );
});

test('a detail is copied word for word', async () => {
  const result = await readLabelDetail(okFetch(completed({ text: 'best before 12 March 2027', reason: null })), 'https://example.invalid', 'key', {
    detail: 'date',
    image: 'aGk=',
    mime: 'image/jpeg',
  });
  assert.equal(result.read.text, 'best before 12 March 2027');
});

test('an unreadable detail names its reason', async () => {
  const result = await readLabelDetail(okFetch(completed({ text: null, reason: 'too_small' })), 'https://example.invalid', 'key', {
    detail: 'ingredients',
    image: 'aGk=',
    mime: 'image/jpeg',
  });
  assert.equal(result.read.reason, 'too_small');
});

test('a detail with both text and a reason is rejected', async () => {
  await assert.rejects(
    readLabelDetail(okFetch(completed({ text: '1 kg', reason: 'too_small' })), 'https://example.invalid', 'key', {
      detail: 'size',
      image: 'aGk=',
      mime: 'image/jpeg',
    }),
    /schema gate/,
  );
});

test('the confirm route rejects a missing image without calling Meta', async () => {
  const res = await confirmRoute({ request: 'water' }, {});
  assert.equal(res.status, 400);
});

test('the detail route rejects an unknown detail without calling Meta', async () => {
  const res = await detailRoute({ detail: 'calories', image: 'aGk=' }, {});
  assert.equal(res.status, 400);
});

test('the confirm instructions name the held product as brand plus kind', async () => {
  let system = '';
  const record: typeof fetch = (async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as { body: string }).body)) as { input: { content: string }[] };
    system = body.input[0]?.content ?? '';
    return { ok: true, json: async () => completed({ verdict: 'unsure', picture_problem: null, asked: ASKED, read: { brand: 'El Taaounia', product: null, variant: null, size: null }, label_name: 'El Taaounia', unreadable: ['product', 'variant', 'size'] }) };
  }) as unknown as typeof fetch;
  await confirmInHand(record, 'https://example.invalid', 'key', PHOTO);
  assert.match(system, /brand plus kind/);
});
