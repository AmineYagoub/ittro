// The confirm voice commands walked on the real statechart: asking
// if it is right rereads the held product, reading a detail copies
// it word for word, and a new request or guide me ends the check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { ShelfOutline } from '../src/relay';

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

test('asking if it is right rereads from a new photo', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.setUnderstand(() => answer({ intent: 'is_this_right' }));
  await driver.heard('are you sure?');
  assert.equal(driver.talk(), 'listening');
  assert.equal(driver.confirm(), 'checking');
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'checking' }]);
  driver.stop();
});

test('a repeated question mid-check keeps the same check', async () => {
  const driver = await checking();
  const epoch = driver.context().confirmEpoch;
  driver.setUnderstand(() => answer({ intent: 'is_this_right' }));
  await driver.heard('is this the right one');
  assert.equal(driver.talk(), 'listening');
  assert.equal(driver.confirm(), 'checking');
  assert.equal(driver.context().confirmEpoch, epoch);
  assert.equal(driver.parts.length, 1);
  driver.stop();
});

test('checking is said once per check', async () => {
  const driver = await checking();
  assert.deepEqual(driver.parts, [[{ clip: 'checking' }]]);
  await driver.advance(9000);
  assert.equal(driver.parts.length, 1);
  assert.deepEqual(driver.context().confirmParts, []);
  driver.stop();
});

test('reading the date asks, then reads it word for word', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.setUnderstand(() => answer({ intent: 'read_detail', detail: 'date' }));
  await driver.heard('read the date');
  assert.equal(driver.talk(), 'listening');
  assert.equal(driver.confirm(), 'readingDetail');
  driver.send({ type: 'CONFIRM_DETAIL', epoch: 1, text: 'best before 12 March 2027', reason: null, crop: CROP });
  await driver.flush();
  assert.equal(driver.confirm(), 'detail');
  assert.equal(driver.context().lastLine, 'The date says: best before 12 March 2027.');
  driver.stop();
});

test('an unreadable detail says which part and what to do', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.setUnderstand(() => answer({ intent: 'read_detail', detail: 'date' }));
  await driver.heard('read the date');
  driver.send({ type: 'CONFIRM_DETAIL', epoch: 1, text: null, reason: 'too_small', crop: CROP });
  await driver.flush();
  assert.equal(driver.context().lastLine, "I can't read the date. The print is too small. Bring it closer.");
  driver.stop();
});

test('a new request ends the check', async () => {
  const driver = await checking();
  driver.setUnderstand(() => answer({ intent: 'request_product', product_text: 'Elio oil' }));
  await driver.heard('I need Elio oil');
  assert.equal(driver.confirm(), 'idle');
  assert.equal(driver.context().confirming, false);
  driver.stop();
});

test('guide me after a no restarts the search and ends the check', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
  await driver.flush();
  driver.send({ type: 'CONFIRM_BEGIN' });
  await driver.flush();
  driver.send({ type: 'CONFIRM_NO', epoch: 1, label: 'Guedila water', crop: CROP });
  await driver.flush();
  driver.setUnderstand(() => answer({ intent: 'guide_me' }));
  await driver.heard('guide me');
  assert.equal(driver.confirm(), 'idle');
  assert.equal(driver.context().searching, true);
  assert.equal(driver.guide(), 'directing');
  driver.stop();
});
