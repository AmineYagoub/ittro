// The in-hand confirm walked on the real statechart: a no names
// the held product and the way back, a yes names every checked
// attribute, an unsure says what was and was not read, and answers
// from a moment already left are never spoken.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startListening } from './driver';
import type { ShelfOutline } from '../src/relay';
import { verdictWord } from '../src/confirm/lines';

const TARGET: ShelfOutline = {
  id: 7,
  frame: 3,
  box: { x1: 800, y1: 400, x2: 1000, y2: 640, w: 1280, h: 960, confidence: null },
};

const CROP = 'data:image/jpeg;base64,aGk=';

async function checking() {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'CONFIRM_BEGIN' });
  await driver.flush();
  assert.equal(driver.confirm(), 'checking');
  return driver;
}

test('picking up starts a quiet check and stops the shelf search', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
  await driver.flush();
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 900, y: 520 } });
  await driver.flush();
  driver.send({ type: 'GUIDE_GOT_IT' });
  await driver.flush();
  assert.equal(driver.guide(), 'idle');
  assert.equal(driver.confirm(), 'checking');
  assert.equal(driver.context().searching, false);
  assert.equal(driver.context().cameraOn, true);
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'pick_up' }, { clip: 'checking' }]);
  driver.stop();
});

test('a no names the held product and the way back, then guides on its own', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
  await driver.flush();
  driver.send({ type: 'CONFIRM_BEGIN' });
  await driver.flush();
  driver.send({ type: 'CONFIRM_NO', epoch: 1, label: 'Guedila water', crop: CROP });
  await driver.flush();
  assert.deepEqual(driver.parts.at(-1), [
    { clip: 'no' },
    { text: 'This is Guedila water.' },
    { clip: 'put_back' },
    { text: 'Masaad water is to your right.' },
  ]);
  assert.equal(driver.context().lastLine, 'No. This is Guedila water. Put it back. Masaad water is to your right.');
  assert.deepEqual(driver.context().lastChips, ['guide me', 'read again']);
  assert.equal(driver.context().step, 'welcome');
  assert.equal(driver.confirm(), 'idle');
  assert.equal(driver.guide(), 'directing');
  driver.stop();
});

test('a yes names the checked product and the next words', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water, 1.5 litres', crop: CROP });
  await driver.flush();
  assert.equal(driver.confirm(), 'yes');
  assert.deepEqual(driver.parts.at(-1), [
    { clip: 'yes' },
    { text: 'This is Masaad water, 1.5 litres.' },
    { text: 'Say find another, or done.' },
  ]);
  assert.equal(driver.context().lastLine, 'Yes. This is Masaad water, 1.5 litres. Say find another, or done.');
  assert.deepEqual(driver.context().lastChips, ['find another', 'done']);
  driver.stop();
});

test('an unsure says what was and was not read, then a reread resolves', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_UNSURE', epoch: 1, label: 'Masaad', crop: CROP, read: ['Masaad'], missing: ['size'] });
  await driver.flush();
  assert.equal(driver.confirm(), 'unsure');
  assert.equal(driver.context().lastLine, 'I can’t confirm yet. I can read Masaad, but not the size. Turn it slowly.');
  driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water, 1.5 litres', crop: CROP });
  await driver.flush();
  assert.equal(driver.confirm(), 'yes');
  driver.stop();
});

test('an empty reread keeps the maybe screen photo and reading', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_UNSURE', epoch: 1, label: 'Masaad', crop: CROP, read: ['Masaad'], missing: ['size'] });
  await driver.flush();
  driver.send({ type: 'CONFIRM_UNSURE', epoch: 1, label: '', crop: '', read: [], missing: [] });
  await driver.flush();
  assert.equal(driver.confirm(), 'unsure');
  assert.equal(driver.context().confirmLabel, 'Masaad');
  assert.equal(driver.context().confirmCrop, CROP);
  assert.deepEqual(driver.context().confirmRead, ['Masaad']);
  assert.deepEqual(driver.context().confirmMissing, ['size']);
  assert.equal(driver.context().lastLine, 'I can’t confirm yet. I can read Masaad, but not the size. Turn it slowly.');
  driver.stop();
});

test('a reread that stays unsure stays silent until it gives up', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_UNSURE', epoch: 1, label: 'Masaad', crop: CROP, read: ['Masaad'], missing: ['size'] });
  await driver.flush();
  const said = driver.parts.length;
  driver.send({ type: 'CONFIRM_UNSURE', epoch: 1, label: 'Masaad', crop: CROP, read: ['Masaad'], missing: ['size'] });
  await driver.flush();
  assert.equal(driver.confirm(), 'unsure');
  assert.equal(driver.parts.length, said);
  driver.send({ type: 'CONFIRM_GIVEUP' });
  await driver.flush();
  assert.equal(driver.confirm(), 'giveup');
  assert.equal(driver.context().lastLine, "I can't read the size. Try holding it closer.");
  driver.stop();
});

test('a stale answer from an older moment is never spoken', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_BEGIN' });
  await driver.flush();
  assert.equal(driver.context().confirmEpoch, 2);
  const said = driver.parts.length;
  driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water', crop: CROP });
  await driver.flush();
  assert.equal(driver.confirm(), 'checking');
  assert.equal(driver.parts.length, said);
  driver.send({ type: 'CONFIRM_YES', epoch: 2, label: 'Masaad water', crop: CROP });
  await driver.flush();
  assert.equal(driver.confirm(), 'yes');
  driver.stop();
});

test('a late answer after the verdict is never spoken, but a new check speaks', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water', crop: CROP });
  await driver.flush();
  const said = driver.parts.length;
  driver.send({ type: 'CONFIRM_NO', epoch: 1, label: 'Guedila water', crop: CROP });
  await driver.flush();
  assert.equal(driver.confirm(), 'yes');
  assert.equal(driver.parts.length, said);
  driver.send({ type: 'CONFIRM_BEGIN' });
  await driver.flush();
  assert.equal(driver.confirm(), 'checking');
  driver.stop();
});

test('a moved hand while asked says so and leaves the moment', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_MOVED', epoch: 1 });
  await driver.flush();
  assert.equal(driver.confirm(), 'checking');
  assert.equal(driver.context().confirmEpoch, 2);
  assert.equal(driver.context().lastLine, 'Your hand moved. Keep it on the product so I can read it.');
  const said = driver.parts.length;
  driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water', crop: CROP });
  await driver.flush();
  assert.equal(driver.parts.length, said);
  driver.stop();
});

test('a moved hand on an automatic check rereads silently', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'CONFIRM_AUTO' });
  await driver.flush();
  assert.equal(driver.confirm(), 'checking');
  assert.equal(driver.parts.length, 0);
  driver.send({ type: 'CONFIRM_MOVED', epoch: 1 });
  await driver.flush();
  assert.equal(driver.context().confirmEpoch, 2);
  assert.equal(driver.parts.length, 0);
  driver.stop();
});

test('a failed read says the lost internet line once, then retries silently', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_FAILED', kind: 'down' });
  await driver.flush();
  assert.equal(driver.link(), 'down');
  assert.equal(driver.context().lastLine, "I've lost the internet. Check the phone has signal; I'll keep trying.");
  const said = driver.spoken.length;
  driver.send({ type: 'CONFIRM_FAILED', kind: 'down' });
  await driver.flush();
  assert.equal(driver.confirm(), 'checking');
  assert.equal(driver.spoken.length, said);
  driver.stop();
});

test('a turned label is a phone action, never a doubt', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_PICTURE', epoch: 1, problem: 'turned' });
  await driver.flush();
  assert.equal(driver.confirm(), 'picture');
  assert.equal(driver.context().lastLine, 'Turn it so the label faces the phone.');
  assert.equal(driver.context().confirmVerdict, 'picture');
  driver.stop();
});

test('silence after a verdict repeats the verdict, not the search', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water, 1.5 litres', crop: CROP });
  await driver.flush();
  await driver.advance(8000);
  assert.equal(driver.spoken.at(-1), 'Yes. This is Masaad water, 1.5 litres. Say find another, or done.');
  driver.stop();
});

test('pausing leaves the moment; reopening repeats the verdict', async () => {
  const driver = await checking();
  driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water, 1.5 litres', crop: CROP });
  await driver.flush();
  driver.send({ type: 'PAUSE' });
  await driver.flush();
  assert.equal(driver.context().confirmEpoch, 2);
  driver.send({ type: 'RESUME' });
  await driver.flush();
  assert.equal(driver.context().confirmVerdict, 'yes');
  assert.equal(driver.spoken.at(-1), 'Yes. This is Masaad water, 1.5 litres. Say find another, or done.');
  driver.stop();
});

test('pausing mid-check keeps the check and drops the old moment on return', async () => {
  const driver = await checking();
  driver.send({ type: 'PAUSE' });
  await driver.flush();
  driver.send({ type: 'RESUME' });
  await driver.flush();
  assert.equal(driver.context().confirming, true);
  assert.equal(driver.context().searching, false);
  assert.equal(driver.context().cameraOn, true);
  const said = driver.parts.length;
  driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water', crop: CROP });
  await driver.flush();
  assert.equal(driver.confirm(), 'checking');
  assert.equal(driver.parts.length, said);
  driver.stop();
});

test('verdict words speak the shopper language', async () => {
  assert.equal(verdictWord('yes', 'ar'), 'نعم');
  assert.equal(verdictWord('no', 'ar'), 'لا');
  assert.equal(verdictWord('unsure', 'fr'), 'Peut-être');
  const driver = await startListening({ language: 'ar', request: 'مياه مسعد' });
  driver.send({ type: 'CONFIRM_BEGIN' });
  await driver.flush();
  driver.send({ type: 'CONFIRM_NO', epoch: 1, label: 'مياه قديلة', crop: CROP });
  await driver.flush();
  assert.ok(driver.context().lastLine.startsWith('لا.'));
  assert.ok(driver.context().lastLine.includes('مياه قديلة'));
  driver.stop();
});
