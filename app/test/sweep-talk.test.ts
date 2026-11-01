// The sweep's lines in the conversation: the start names the product
// and the way to turn, a new cue replaces one not yet said, and the
// not-here summary without an offer says what the shopper can say
// next; after a sweep that did not cover the shelf it never claims it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';

async function searching() {
  resetStorage();
  const driver = await startListening();
  driver.setUnderstand((input) =>
    input.transcript.includes('Masaad') ? answer({ intent: 'request_product', product_text: 'Masaad water' }) : answer({ intent: 'confirm_yes' }),
  );
  await driver.heard("I'm looking for Masaad water");
  return driver;
}

test('the sweep starts by naming the product and the way to turn', async () => {
  const driver = await searching();
  try {
    await driver.heard('Yes');
    driver.send({ type: 'SWEEP_CUE', cue: 'start', product: 'Masaad water' });
    await driver.flush();
    assert.equal(driver.spoken[driver.spoken.length - 1], "I don't see Masaad water here. Turn the phone slowly to the right.");
  } finally {
    driver.stop();
  }
});

test('a new sweep cue replaces one not yet said, so stop never follows a late turn', async () => {
  const driver = await searching();
  try {
    assert.equal(driver.context().step, 'confirm');
    driver.send({ type: 'SWEEP_CUE', cue: 'right', product: 'Masaad water' });
    driver.send({ type: 'SWEEP_CUE', cue: 'stop', product: 'Masaad water' });
    await driver.flush();
    const sweep = driver.context().pendingSearch.filter((line) => line.kind === 'sweep');
    assert.deepEqual(
      sweep.map((line) => line.text),
      ['Stop.'],
    );
  } finally {
    driver.stop();
  }
});

test('not here with nothing to offer says what to say next', async () => {
  const driver = await searching();
  try {
    await driver.heard('Yes');
    driver.send({ type: 'NOT_HERE', wanted: 'Masaad water', answer: 'No Masaad water on this shelf. I see Guedila water.', offer: null, checked: 9, whole: true });
    await driver.flush();
    assert.equal(
      driver.spoken[driver.spoken.length - 1],
      'I checked the whole shelf. No Masaad water on this shelf. I see Guedila water. Say keep looking, find another, or ask someone.',
    );
    assert.deepEqual(driver.context().lastChips, ['keep looking', 'find another', 'ask someone']);
    assert.equal(driver.context().alternative, null);
  } finally {
    driver.stop();
  }
});

test('a shelf swept without a full sweep is not called the whole shelf', async () => {
  const driver = await searching();
  try {
    await driver.heard('Yes');
    driver.send({ type: 'NOT_HERE', wanted: 'Masaad water', answer: 'No Masaad water on this shelf.', offer: 'Guedila water', checked: 4, whole: false });
    await driver.flush();
    assert.equal(driver.spoken[driver.spoken.length - 1], 'No Masaad water on this shelf. Do you want Guedila water?');
    assert.equal(driver.context().step, 'alternative');
  } finally {
    driver.stop();
  }
});
