// Understanding never waits forever: a relay call that hangs past
// the deadline is taken as a broken link and listening resumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startListening } from './driver';
import { UNDERSTAND_TIMEOUT_MS } from '../src/conversation/link';
import { resetStorage } from './stubs.mjs';

test('a hung understanding gives up after the deadline', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => new Promise(() => undefined));
    await driver.heard("I'm looking for Masaad water");
    assert.equal(driver.talk(), 'understanding');
    await driver.advance(UNDERSTAND_TIMEOUT_MS - 1);
    assert.equal(driver.talk(), 'understanding');
    await driver.advance(1);
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.link(), 'broken');
  } finally {
    driver.stop();
  }
});
