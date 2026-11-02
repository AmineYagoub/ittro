// A heard turn that never becomes words must not silence Ittro: in
// t23 Meta's stream ended a turn with no transcript and Ittro said
// nothing for four minutes. The wait for words restarts on every
// sign of voice, and words that come in time are understood as ever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';
import { HEARD_STALE_MS } from '../src/conversation/heardStale';

test('a turn that ends with no words leaves Ittro asking again (t23)', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'not_understood' }));
    driver.send({ type: 'SPEECH_ENDED' });
    await driver.flush();
    const said = driver.spoken.length;
    await driver.advance(HEARD_STALE_MS - 500);
    assert.equal(driver.spoken.length, said, 'the words may still come');
    await driver.advance(500);
    await driver.advance(8000);
    assert.ok(driver.spoken.length > said, 'Ittro asks again');
  } finally {
    driver.stop();
  }
});

test('a fragment that never grows leaves Ittro asking again', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'not_understood' }));
    await driver.partial('I');
    assert.equal(driver.talk(), 'listening');
    const said = driver.spoken.length;
    await driver.advance(HEARD_STALE_MS - 1000);
    await driver.partial('I');
    await driver.advance(HEARD_STALE_MS - 1000);
    assert.equal(driver.spoken.length, said, 'a newer sign of voice restarts the wait');
    await driver.advance(1000);
    await driver.advance(8000);
    assert.ok(driver.spoken.length > said, 'Ittro asks again');
  } finally {
    driver.stop();
  }
});

test('words that come in time are understood', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand(() => {
      calls += 1;
      return answer({ intent: 'request_product', product_text: 'Masaad water' });
    });
    driver.send({ type: 'SPEECH_ENDED' });
    await driver.flush();
    await driver.advance(1000);
    await driver.heard("I'm looking for Masaad water");
    assert.equal(calls, 1);
    assert.equal(driver.context().step, 'confirm');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Masaad water\. Is that right/);
  } finally {
    driver.stop();
  }
});
