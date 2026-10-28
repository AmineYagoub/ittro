// Walks the silence budget: the question again at 8 s, help at
// 20 s, a reminder every 60 s, and the clock restarting on speech.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';

test('asks again at 8 s and offers help at 20 s', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    assert.equal(driver.talk(), 'listening');
    await driver.advance(8000);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /What are you looking for/);
    assert.equal(driver.talk(), 'listening');
    await driver.advance(12000);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Say help to hear/);
    assert.equal(driver.talk(), 'listening');
  } finally {
    driver.stop();
  }
});

test('reminds every 60 s until heard', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    await driver.advance(8000);
    await driver.advance(12000);
    const helps = driver.spoken.filter((line) => line.includes('Say help to hear')).length;
    assert.equal(helps, 1);
    await driver.advance(60000);
    const reminded = driver.spoken.filter((line) => line.includes('Say help to hear')).length;
    assert.equal(reminded, 2);
  } finally {
    driver.stop();
  }
});

test('an answered sentence restarts the silence clock', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'help' }));
    await driver.advance(7000);
    await driver.heard('help');
    const afterHelp = driver.spoken.length;
    await driver.advance(7000);
    assert.equal(driver.spoken.length, afterHelp);
    await driver.advance(1000);
    assert.equal(driver.spoken.length, afterHelp + 1);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /What are you looking for/);
  } finally {
    driver.stop();
  }
});
