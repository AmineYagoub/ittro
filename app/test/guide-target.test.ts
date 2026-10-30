// The green rectangle only: the found target follows its track
// between shelf reads, holds its last box when the track is gone,
// and the name pill shows the short product name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startListening } from './driver';
import type { ShelfOutline } from '../src/relay';

function outline(id: number, x1: number, y1: number, x2: number, y2: number): ShelfOutline {
  return { id, frame: 3, box: { x1, y1, x2, y2, w: 1280, h: 960, confidence: null } };
}

const TARGET = outline(7, 600, 400, 760, 640);

function found() {
  return { type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' } as const;
}

async function guiding() {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send(found());
  await driver.flush();
  assert.equal(driver.guide(), 'aiming');
  driver.send({ type: 'GUIDE_CUE', cue: 'hand_right', proximity: 0.4, hand: { x: 300, y: 520 } });
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  return driver;
}

test('the found target follows its track between shelf reads', async () => {
  const driver = await guiding();
  try {
    driver.send({
      type: 'OUTLINES_MOVED',
      outlines: [outline(7, 620, 400, 780, 640), outline(9, 100, 100, 200, 260)],
    });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.box.x1, 620);
  } finally {
    driver.stop();
  }
});

test('the found target holds its last box when its track is gone', async () => {
  const driver = await guiding();
  try {
    driver.send({ type: 'OUTLINES_MOVED', outlines: [outline(9, 100, 100, 200, 260)] });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.box.x1, 600);
  } finally {
    driver.stop();
  }
});

test('the name pill shows the short product name', async () => {
  const driver = await startListening({ request: 'Masaad water, the big bottle' });
  try {
    driver.send({ ...found(), product: 'Masaad water, the big bottle' });
    await driver.flush();
    assert.equal(driver.context().guideLabel, 'Masaad water');
  } finally {
    driver.stop();
  }
});
