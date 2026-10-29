// The link walked on the real statechart: network loss, limits
// and broken answers are states, each said once with what to do,
// and any success recovers so the next failure speaks again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';

test('a lost network is said once, then recovers on its own', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.send({ type: 'STREAM_FAILED', message: 'could not open the stream' });
    await driver.flush();
    assert.equal(driver.link(), 'down');
    assert.equal(
      driver.spoken[driver.spoken.length - 1],
      "I've lost the internet. Check the phone has signal; I'll keep trying.",
    );
    const said = driver.spoken.length;
    driver.send({ type: 'STREAM_FAILED', message: 'could not open the stream' });
    await driver.flush();
    assert.equal(driver.spoken.length, said);
    driver.send({ type: 'STREAM_OPEN' });
    await driver.flush();
    assert.equal(driver.link(), 'ok');
    driver.send({ type: 'STREAM_FAILED', message: 'could not open the stream' });
    await driver.flush();
    assert.equal(driver.spoken.length, said + 1);
  } finally {
    driver.stop();
  }
});

test('a limit is said once with what to do', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.send({ type: 'SEARCH_FAILED', kind: 'limited' });
    await driver.flush();
    assert.equal(driver.link(), 'limited');
    assert.equal(
      driver.spoken[driver.spoken.length - 1],
      "I've reached my asking limit. Give me a minute; I'll keep trying.",
    );
    const said = driver.spoken.length;
    driver.send({ type: 'SEARCH_FAILED', kind: 'limited' });
    await driver.flush();
    assert.equal(driver.spoken.length, said);
    driver.send({ type: 'LINK_OK' });
    await driver.flush();
    assert.equal(driver.link(), 'ok');
  } finally {
    driver.stop();
  }
});

test('a broken understand answer is said once with what to do', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => {
      throw new Error('relay answer is not json');
    });
    await driver.heard('Masaad water');
    assert.equal(driver.link(), 'broken');
    assert.equal(
      driver.spoken[driver.spoken.length - 1],
      "Something came back broken. I'll try again; say it once more if I stay quiet.",
    );
    assert.equal(driver.talk(), 'listening');
    driver.setUnderstand(() => answer({ intent: 'not_understood' }));
    await driver.heard('Masaad water');
    assert.equal(driver.link(), 'ok');
  } finally {
    driver.stop();
  }
});

test('a new failure while down speaks the new line once', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.send({ type: 'STREAM_FAILED', message: 'could not open the stream' });
    await driver.flush();
    assert.equal(driver.link(), 'down');
    driver.send({ type: 'SEARCH_FAILED', kind: 'broken' });
    await driver.flush();
    assert.equal(driver.link(), 'broken');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /came back broken/);
    const said = driver.spoken.length;
    driver.send({ type: 'LINK_OK' });
    await driver.flush();
    assert.equal(driver.link(), 'ok');
    assert.equal(driver.spoken.length, said);
  } finally {
    driver.stop();
  }
});
