// The green rectangle only: the found target follows its track
// between shelf reads, holds its last box when the track is gone,
// and the name pill shows the short product name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
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

test('the found target follows its box across a fresh shelf pass', async () => {
  const driver = await guiding();
  try {
    const fresh = { id: 2, frame: 4, box: { x1: 620, y1: 400, x2: 780, y2: 640, w: 1280, h: 960, confidence: null } };
    driver.send({ type: 'OUTLINES_MOVED', outlines: [fresh, outline(9, 100, 100, 200, 260)] });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.box.x1, 620);
    assert.equal(driver.context().guideTarget?.frame, 4);
  } finally {
    driver.stop();
  }
});

test('a fresh pass reusing the target id elsewhere does not drag the rectangle', async () => {
  const driver = await guiding();
  try {
    driver.send({
      type: 'OUTLINES_MOVED',
      outlines: [outline(7, 100, 100, 200, 260), outline(9, 610, 400, 770, 640)],
    });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.box.x1, 610);
    assert.equal(driver.context().guideTarget?.id, 9);
  } finally {
    driver.stop();
  }
});

test('a hand on the product holds the box when SAM shrinks it', async () => {
  const driver = await guiding();
  try {
    driver.send({ type: 'GUIDE_CUE', cue: 'hand_right', proximity: 0.9, hand: { x: 680, y: 520 } });
    await driver.flush();
    driver.send({ type: 'OUTLINES_MOVED', outlines: [outline(9, 620, 500, 780, 640)] });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.box.x1, 600);
    assert.equal(driver.context().guideTarget?.box.y1, 400);
    assert.equal(driver.context().guideRecheck, false);
  } finally {
    driver.stop();
  }
});

test('a jumped box holds and asks for a recheck, a steady one follows', async () => {
  const driver = await guiding();
  try {
    driver.send({ type: 'OUTLINES_MOVED', outlines: [outline(9, 620, 500, 780, 640)] });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.box.x1, 600);
    assert.equal(driver.context().guideRecheck, true);
    driver.send({ type: 'OUTLINES_MOVED', outlines: [outline(9, 610, 400, 770, 640)] });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.box.x1, 610);
    assert.equal(driver.context().guideRecheck, false);
  } finally {
    driver.stop();
  }
});

test('a re-found outline while directing adopts silently', async () => {
  const driver = await guiding();
  try {
    const sounded = driver.parts.length;
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: outline(4, 640, 420, 800, 660), matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.equal(driver.guide(), 'directing');
    assert.equal(driver.context().guideTarget?.box.x1, 640);
    assert.equal(driver.context().guideOutOfView, false);
    assert.equal(driver.context().guideRecheck, false);
    assert.equal(driver.parts.length, sounded);
  } finally {
    driver.stop();
  }
});

test('a re-found outline when lost goes back to aiming', async () => {
  const driver = await guiding();
  try {
    driver.send({ type: 'GUIDE_TARGET_LOST', cue: 'phone_right_small' });
    await driver.flush();
    assert.equal(driver.guide(), 'targetLost');
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: outline(4, 640, 420, 800, 660), matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.equal(driver.guide(), 'aiming');
    assert.equal(driver.context().guideTarget?.box.x1, 640);
    assert.equal(driver.context().guideOutOfView, false);
  } finally {
    driver.stop();
  }
});

test('the overlay hides while the target is out of view', async () => {
  const driver = await guiding();
  try {
    assert.equal(driver.context().guideOutOfView, false);
    driver.send({ type: 'GUIDE_TARGET_LOST', cue: 'phone_right_small' });
    await driver.flush();
    assert.equal(driver.context().guideOutOfView, true);
    driver.send({ type: 'GUIDE_CUE', cue: 'hand_right', proximity: 0.4, hand: { x: 300, y: 520 } });
    await driver.flush();
    assert.equal(driver.context().guideOutOfView, false);
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

test('the find points from the hand when the hand is known', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  try {
    driver.setUnderstand(() => answer({ intent: 'where_is_it' }));
    driver.holdSpeech(true);
    await driver.heard('Where is it?');
    driver.send({ ...found(), position: 'middle' });
    await driver.flush();
    assert.equal(driver.guide(), 'arming');
    driver.send({ type: 'GUIDE_CUE', cue: 'hand_right', proximity: 0.4, hand: { x: 300, y: 520 } });
    await driver.flush();
    driver.holdSpeech(false);
    await driver.flush();
    assert.equal(driver.context().lastLine, 'I found Masaad water to your right.');
  } finally {
    driver.stop();
  }
});
