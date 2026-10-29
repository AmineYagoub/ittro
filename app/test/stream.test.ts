// Stream drops: a relay-side error or close restarts the stream
// silently, only a failed connect says the internet is lost, an open
// socket never restarts itself, and a drop mid-understanding still
// restarts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startListening } from './driver';
import { resetStorage } from './stubs.mjs';
import { createMicStats } from '../src/conversation/micStats';

test('a relay error restarts the stream silently', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.send({ type: 'STREAM_OPEN' });
    await driver.flush();
    const said = driver.spoken.length;
    driver.send({ type: 'STREAM_ERROR', message: 'Ingress audio slower than real-time' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.spoken.length, said);
    assert.equal(driver.context().streamUp, false);
    assert.ok(driver.streamCommands.some((command) => command.type === 'START'));
  } finally {
    driver.stop();
  }
});

test('a closed socket restarts the stream silently', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.send({ type: 'STREAM_OPEN' });
    await driver.flush();
    const said = driver.spoken.length;
    driver.send({ type: 'STREAM_CLOSED' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.spoken.length, said);
    assert.equal(driver.context().streamUp, false);
    assert.ok(driver.streamCommands.some((command) => command.type === 'START'));
  } finally {
    driver.stop();
  }
});

test('a failed connect says the internet is lost once', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.send({ type: 'STREAM_FAILED', message: 'could not open the stream' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /lost the internet/);
    const said = driver.spoken.length;
    driver.send({ type: 'STREAM_FAILED', message: 'could not open the stream' });
    await driver.flush();
    assert.equal(driver.spoken.length, said);
  } finally {
    driver.stop();
  }
});

test('an open stream while speculating does not restart it', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    await driver.partial('Masaad wat');
    assert.equal(driver.talk(), 'speculating');
    driver.streamCommands.length = 0;
    driver.send({ type: 'STREAM_OPEN' });
    await driver.flush();
    assert.equal(driver.talk(), 'speculating');
    assert.equal(driver.context().streamUp, true);
    assert.deepEqual(driver.streamCommands, []);
  } finally {
    driver.stop();
  }
});

test('recorded mic arrivals summarize rate, gaps and faults', () => {
  let now = 10000;
  const stats = createMicStats(() => now);
  for (let at = 0; at < 100; at += 1) {
    stats.arrival(at === 50 ? 52 : at);
    now += at === 10 ? 400 : 80;
  }
  stats.dropPreReady();
  stats.failSend();
  const summary = stats.snapshot();
  assert.equal(summary.ratePerSecond, 100 / ((99 * 80 + 400) / 1000));
  assert.equal(summary.gapP50, 80);
  assert.equal(summary.gapP95, 80);
  assert.equal(summary.gapMax, 400);
  assert.equal(summary.seqGaps, 2);
  assert.equal(summary.notReady, 1);
  assert.equal(summary.sendErr, 1);
  assert.equal(stats.count(), 100);
  stats.reset();
  assert.equal(stats.count(), 0);
  assert.equal(stats.snapshot().seqGaps, 0);
});

test('a drop mid-understanding restarts the stream silently', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => new Promise(() => undefined));
    driver.send({ type: 'FINAL_TEXT', text: 'Masaad water' });
    await driver.flush();
    assert.equal(driver.talk(), 'understanding');
    driver.streamCommands.length = 0;
    const said = driver.spoken.length;
    driver.send({ type: 'STREAM_CLOSED' });
    await driver.flush();
    assert.equal(driver.talk(), 'understanding');
    assert.equal(driver.spoken.length, said);
    assert.ok(driver.streamCommands.some((command) => command.type === 'START'));
  } finally {
    driver.stop();
  }
});
