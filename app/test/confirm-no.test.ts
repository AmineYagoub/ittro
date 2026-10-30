// Ittro always guides on its own: a no verdict names the held
// product and the way back, then guides straight to the shelf
// target without waiting for "guide me". Without a target it
// searches the shelf again. Checking the hand stops guidance, and
// a helper no behaves the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { Driver } from './driver';
import type { ShelfOutline } from '../src/relay';
import { resetStorage } from './stubs.mjs';

const TARGET: ShelfOutline = {
  id: 7,
  frame: 3,
  box: { x1: 800, y1: 400, x2: 1000, y2: 640, w: 1280, h: 960, confidence: null },
};

const CROP = 'data:image/jpeg;base64,aGk=';

async function paired(): Promise<Driver> {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  driver.setUnderstand(() => answer({ intent: 'add_helper', helper_name: 'Sara' }));
  await driver.heard('Add a helper');
  driver.send({ type: 'HELPER_JOINED', name: 'Sara', token: 'tok1' });
  await driver.flush();
  return driver;
}

async function waiting(): Promise<Driver> {
  const driver = await paired();
  driver.setUnderstand((input) =>
    input.transcript.toLowerCase().includes('ask') ? answer({ intent: 'ask_someone' }) : answer({ intent: 'confirm_yes' }),
  );
  await driver.heard('Ask someone');
  await driver.heard('Yes');
  assert.equal(driver.helper(), 'waiting');
  return driver;
}

test('a no with a shelf target guides straight back to it', async () => {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  try {
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    driver.send({ type: 'CONFIRM_BEGIN' });
    await driver.flush();
    driver.send({ type: 'CONFIRM_NO', epoch: driver.context().confirmEpoch, label: 'Guedila water', crop: CROP });
    await driver.flush();
    assert.match(driver.context().lastLine, /No\. This is Guedila water\. Put it back\. Masaad water is to your right/);
    assert.ok(!/Say guide me/.test(driver.context().lastLine));
    assert.deepEqual(driver.context().lastChips, ['guide me', 'read again']);
    assert.equal(driver.confirm(), 'idle');
    assert.equal(driver.guide(), 'directing');
    assert.equal(driver.search(), 'active');
    assert.equal(driver.context().guiding, true);
    assert.deepEqual(driver.context().guideTarget, TARGET);
  } finally {
    driver.stop();
  }
});

test('a no without a shelf target searches the shelf again', async () => {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  try {
    driver.send({ type: 'CONFIRM_BEGIN' });
    await driver.flush();
    driver.send({ type: 'CONFIRM_NO', epoch: driver.context().confirmEpoch, label: 'Guedila water', crop: CROP });
    await driver.flush();
    assert.match(driver.context().lastLine, /No\. This is Guedila water\. Put it back\. I'll look for it on the shelf/);
    assert.equal(driver.confirm(), 'idle');
    assert.equal(driver.search(), 'active');
    assert.equal(driver.context().guiding, false);
    assert.equal(driver.guide(), 'idle');
  } finally {
    driver.stop();
  }
});

test('checking the hand stops the guidance', async () => {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  try {
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.equal(driver.context().guiding, true);
    driver.setUnderstand(() => answer({ intent: 'is_this_right' }));
    await driver.heard('is this the right one');
    assert.equal(driver.context().confirming, true);
    assert.equal(driver.context().guiding, false);
    assert.equal(driver.guide(), 'idle');
  } finally {
    driver.stop();
  }
});

test('a helper no while guiding keeps guiding and says no ask', async () => {
  const driver = await waiting();
  try {
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    driver.send({ type: 'HELPER_ANSWER', verdict: 'no', note: null, helper: 'Sara' });
    await driver.flush();
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Sara says no: this is not Masaad water\./);
    assert.ok(!/Say guide me/.test(driver.spoken[driver.spoken.length - 1] ?? ''));
    assert.equal(driver.context().helperVerdict, null);
    assert.equal(driver.context().guiding, true);
  } finally {
    driver.stop();
  }
});

test('a helper no without a shelf target searches the shelf again', async () => {
  const driver = await waiting();
  try {
    driver.send({ type: 'HELPER_ANSWER', verdict: 'no', note: null, helper: 'Sara' });
    await driver.flush();
    assert.match(
      driver.spoken[driver.spoken.length - 1] ?? '',
      /Sara says no: this is not Masaad water\. I'll look for it on the shelf/,
    );
    assert.equal(driver.context().helperVerdict, null);
    assert.equal(driver.search(), 'active');
    assert.equal(driver.context().guiding, false);
  } finally {
    driver.stop();
  }
});
