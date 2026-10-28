// Walks pausing and reopening: from listening with a request, and
// the stale-answer guard when understanding lands after a pause.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { UnderstandAnswer } from '../src/relay';
import { resetStorage } from './stubs.mjs';

test('reopening from listening says where it was', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    driver.send({ type: 'PAUSE' });
    await driver.flush();
    assert.equal(driver.talk(), 'paused');
    assert.equal(driver.context().epoch, 1);
    driver.send({ type: 'RESUME' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Welcome back.*Masaad water/);
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
});

test('reopening after it paused itself wakes it with the request', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.includes('Yes')) {
        return answer({ intent: 'confirm_yes' });
      }
      return answer({ intent: 'stop' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    await driver.heard('stop');
    assert.equal(driver.talk(), 'sleeping');
    await driver.advance(120000);
    assert.equal(driver.talk(), 'over');
    assert.equal(driver.context().epoch, 1);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Open Ittro to wake me/);
    driver.send({ type: 'RESUME' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Welcome back.*Masaad water/);
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
});

test('an answer landing after a pause is never acted on', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let release!: (value: UnderstandAnswer) => void;
    const gated = new Promise<UnderstandAnswer>((resolve) => {
      release = resolve;
    });
    driver.setUnderstand(() => gated);
    const heard = driver.heard("I'm looking for Masaad water");
    await driver.flush();
    assert.equal(driver.talk(), 'understanding');
    driver.send({ type: 'PAUSE' });
    await driver.flush();
    assert.equal(driver.talk(), 'paused');
    release(answer({ intent: 'request_product', product_text: 'Masaad water' }));
    await heard;
    await driver.flush();
    assert.equal(driver.talk(), 'paused');
    assert.equal(driver.context().routeAnswer, null);
    driver.send({ type: 'RESUME' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.context().request, null);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /What are you looking for/);
  } finally {
    driver.stop();
  }
});
