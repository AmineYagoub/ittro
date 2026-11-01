// The 26 October rule, back from the first project: the fingertip
// resting on the product the shelf read confirmed starts the check of
// what the hand holds, and only that read's yes is the green yes (t10
// touched a reflection and got yes at once); a hand only passing over
// it starts nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startListening } from './driver';
import type { ShelfOutline } from '../src/relay';

const TARGET: ShelfOutline = {
  id: 7,
  frame: 3,
  box: { x1: 800, y1: 400, x2: 1000, y2: 640, w: 1280, h: 960, confidence: null },
};

test('a fingertip held on the confirmed product checks the hand, then says yes', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
  await driver.flush();
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 900, y: 520 } });
  await driver.flush();
  assert.equal(driver.guide(), 'reaching');
  await driver.advance(700);
  assert.equal(driver.guide(), 'idle');
  assert.equal(driver.confirm(), 'checking');
  assert.deepEqual(driver.context().confirmBox, TARGET.box);
  driver.send({ type: 'CONFIRM_YES', epoch: driver.context().confirmEpoch, label: 'Masaad water', crop: 'crop' });
  await driver.flush();
  assert.equal(driver.confirm(), 'yes');
  assert.equal(driver.context().confirmVerdict, 'yes');
  assert.equal(driver.context().confirmFinal, true);
  assert.match(driver.context().lastLine, /Masaad water/);
  driver.stop();
});

test('a hand passing over the product does not say yes', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
  await driver.flush();
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 900, y: 520 } });
  await driver.flush();
  await driver.advance(300);
  driver.send({ type: 'GUIDE_CUE', cue: 'hand_left_small', proximity: 0.5, hand: { x: 700, y: 520 } });
  await driver.flush();
  await driver.advance(700);
  assert.notEqual(driver.confirm(), 'yes');
  driver.stop();
});

test('a touch on something the hand read says is not it is a no, never a yes', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
  await driver.flush();
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 900, y: 520 } });
  await driver.flush();
  await driver.advance(700);
  driver.send({ type: 'CONFIRM_NO', epoch: driver.context().confirmEpoch, label: 'Guedila water', crop: 'crop' });
  await driver.flush();
  assert.notEqual(driver.confirm(), 'yes');
  assert.match(driver.context().lastLine, /Guedila/);
  driver.stop();
});
