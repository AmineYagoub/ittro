// Nothing interrupts a question waiting for its answer or a check
// in progress: shelf lines queue until the answer, and silence never
// re-asks while guiding or checking. A verdict re-arms the clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { shouldTickForSearch } from '../src/shelf/useShelfSearch';
import { holdPhoneLine } from '../src/shelf/searchLines';
import { searchingFor } from '../src/requestLines';
import { resetStorage } from './stubs.mjs';

const SEARCHING = searchingFor('Masaad water', 'en');

async function confirmedDriver() {
  resetStorage();
  const driver = await startListening();
  driver.setUnderstand((input) =>
    input.transcript.includes('Masaad')
      ? answer({ intent: 'request_product', product_text: 'Masaad water' })
      : answer({ intent: 'confirm_yes' }),
  );
  await driver.heard("I'm looking for Masaad water");
  await driver.heard('Yes');
  return driver;
}

test('shelf lines wait while a question is open', async () => {
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water");
    const question = driver.spoken.at(-1);
    driver.send({ type: 'NO_SHELF', floor: false });
    await driver.flush();
    assert.equal(driver.spoken.at(-1), question);
    await driver.heard('Yes');
    assert.equal(driver.spoken.at(-1), holdPhoneLine('en', false));
  } finally {
    driver.stop();
  }
});

test('silence never re-asks during a check, and the verdict re-arms it', async () => {
  const driver = await confirmedDriver();
  try {
    driver.setUnderstand(() => answer({ intent: 'is_this_right' }));
    await driver.heard('is this the right one');
    assert.equal(driver.context().confirming, true);
    await driver.advance(9000);
    assert.equal(driver.spoken.at(-1), SEARCHING);
    driver.send({
      type: 'CONFIRM_NO',
      epoch: driver.context().confirmEpoch,
      label: 'Guedila bottle',
      crop: 'crop',
    });
    await driver.flush();
    const before = driver.spoken.at(-1) ?? '';
    assert.match(driver.context().lastLine, /No\. This is Guedila bottle/);
    await driver.advance(9000);
    assert.equal(driver.spoken.at(-1), driver.context().lastLine);
    assert.notEqual(driver.spoken.at(-1), before);
  } finally {
    driver.stop();
  }
});

test('silence never re-asks while guiding', async () => {
  const driver = await confirmedDriver();
  try {
    driver.send({
      type: 'SHELF_FOUND',
      product: 'Masaad water',
      kind: 'bottles',
      outline: { id: 1, frame: 1, box: { x1: 0, y1: 0, x2: 10, y2: 10, w: 10, h: 10, confidence: null } },
      matches: 1,
      position: 'left',
    });
    await driver.flush();
    assert.equal(driver.context().guiding, true);
    await driver.advance(9000);
    assert.equal(driver.spoken.at(-1), SEARCHING);
  } finally {
    driver.stop();
  }
});

test('search ticks while looking, quiet while guiding or checking', () => {
  assert.equal(shouldTickForSearch(true, false, false), true);
  assert.equal(shouldTickForSearch(true, true, false), false);
  assert.equal(shouldTickForSearch(true, false, true), false);
  assert.equal(shouldTickForSearch(false, false, false), false);
});
