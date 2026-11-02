// Out of view, t37: the product is named once, then only the turn line
// repeats every 6 s, following where the product went. A product
// re-found while out of view stays out of view until the camera sees
// it, and back in the picture the repeat stops and the guide aims
// again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startListening } from './driver';
import type { ShelfOutline } from '../src/relay';
import type { SpeechPart } from '../src/conversation/types';
import { REPEAT_MS } from '../src/guide/guideSay';

function outline(id: number, x1: number, y1: number, x2: number, y2: number): ShelfOutline {
  return { id, frame: 3, box: { x1, y1, x2, y2, w: 1280, h: 960, confidence: null } };
}

const TARGET = outline(7, 600, 400, 760, 640);

async function outOfView() {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
  await driver.flush();
  driver.send({ type: 'GUIDE_CUE', cue: 'hand_right', proximity: 0.4, hand: { x: 300, y: 520 } });
  await driver.flush();
  driver.send({ type: 'GUIDE_TARGET_LOST', cue: 'phone_right_small' });
  await driver.flush();
  assert.equal(driver.guide(), 'targetLost');
  return driver;
}

function texts(parts: SpeechPart[] | undefined): string[] {
  return (parts ?? []).flatMap((part) => ('text' in part ? [part.text] : []));
}

test('t37: out of view names the product once, then repeats only the turn line', async () => {
  const driver = await outOfView();
  try {
    assert.ok(texts(driver.parts.at(-1)).some((line) => line.includes('Masaad water')));
    const said = driver.parts.length;
    await driver.advance(REPEAT_MS);
    assert.equal(driver.parts.length, said + 1);
    assert.deepEqual(driver.parts.at(-1), [{ clip: 'phone_right_small' }]);
    await driver.advance(REPEAT_MS);
    assert.deepEqual(driver.parts.at(-1), [{ clip: 'phone_right_small' }]);
  } finally {
    driver.stop();
  }
});

test('t37: the repeat turns the way the product went, with nothing said in between', async () => {
  const driver = await outOfView();
  try {
    const said = driver.parts.length;
    driver.send({ type: 'GUIDE_TARGET_LOST', cue: 'phone_up_small' });
    await driver.flush();
    assert.equal(driver.parts.length, said);
    await driver.advance(REPEAT_MS);
    assert.deepEqual(driver.parts.at(-1), [{ clip: 'phone_up_small' }]);
  } finally {
    driver.stop();
  }
});

test('t37: a product re-found while out of view is adopted silently and stays out of view', async () => {
  const driver = await outOfView();
  try {
    const said = driver.parts.length;
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: outline(4, 640, 420, 800, 660), matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.equal(driver.guide(), 'targetLost');
    assert.equal(driver.context().guideTarget?.box.x1, 640);
    assert.equal(driver.context().guideOutOfView, true);
    driver.send({ type: 'GUIDE_TARGET_LOST', cue: 'phone_right_small' });
    await driver.flush();
    assert.equal(driver.parts.length, said);
  } finally {
    driver.stop();
  }
});

test('t37: back in the picture, the repeat stops and the guide aims again', async () => {
  const driver = await outOfView();
  try {
    driver.send({ type: 'GUIDE_TARGET_BACK' });
    await driver.flush();
    const said = driver.parts.length;
    await driver.advance(REPEAT_MS);
    assert.equal(driver.guide(), 'aiming');
    assert.equal(driver.parts.length, said);
  } finally {
    driver.stop();
  }
});
