// Walks every button gesture on the real statechart: a press means
// exactly what the spoken word means, in every state. Voice and
// button paths are compared line for line where they overlap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromPromise } from 'xstate';
import { answer, startConversation, startListening } from './driver';
import { resetStorage } from './stubs.mjs';
import type { ShelfOutline } from '../src/relay';

function outline(): ShelfOutline {
  return { id: 7, frame: 3, box: { x1: 600, y1: 400, x2: 760, y2: 640, w: 1280, h: 960, confidence: null } };
}

async function confirming(): Promise<Awaited<ReturnType<typeof startListening>>> {
  resetStorage();
  const driver = await startListening();
  driver.setUnderstand(() => answer({ intent: 'request_product', product_text: 'Masaad water' }));
  await driver.heard("I'm looking for Masaad water");
  assert.equal(driver.context().step, 'confirm');
  return driver;
}

test('a single press answers yes at a confirm question, like the word', async () => {
  const driver = await confirming();
  try {
    driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
    await driver.flush();
    assert.equal(driver.context().request, 'Masaad water');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Searching the shelf/);
    assert.equal(driver.context().routeAnswer?.intent, 'confirm_yes');
  } finally {
    driver.stop();
  }
});

test('a double press answers no at a confirm question, like the word', async () => {
  const driver = await confirming();
  try {
    driver.setUnderstand(() => answer({ intent: 'confirm_no' }));
    await driver.heard('No');
    const voiceLine = driver.spoken[driver.spoken.length - 1];
    driver.stop();
    const pressed = await confirming();
    try {
      pressed.send({ type: 'BUTTON_PRESS', gesture: 'double' });
      await pressed.flush();
      assert.equal(pressed.spoken[pressed.spoken.length - 1], voiceLine);
      assert.equal(pressed.context().step, 'welcome');
    } finally {
      pressed.stop();
    }
  } finally {
    driver.stop();
  }
});

test('a single press repeats the last line when no question is open', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    const before = driver.spoken.length;
    driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
    await driver.flush();
    assert.equal(driver.spoken.length, before + 1);
    assert.equal(driver.spoken[driver.spoken.length - 1], driver.context().lastLine);
    assert.equal(driver.context().routeAnswer?.intent, 'repeat');
  } finally {
    driver.stop();
  }
});

test('a single press is got it after Reach forward, repeat while directing', async () => {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  try {
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: outline(), matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    driver.send({ type: 'GUIDE_CUE', cue: 'hand_right', proximity: 0.4, hand: { x: 300, y: 520 } });
    await driver.flush();
    driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
    await driver.flush();
    assert.equal(driver.context().routeAnswer?.intent, 'repeat');
    assert.equal(driver.guide(), 'directing');
    driver.send({ type: 'GUIDE_COVERING', proximity: 0.95, hand: { x: 600, y: 500 } });
    await driver.flush();
    assert.equal(driver.guide(), 'reaching');
    driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
    assert.equal(driver.guide(), 'picking');
    await driver.flush();
    assert.equal(driver.context().routeAnswer?.intent, 'got_it');
    assert.deepEqual(driver.parts.at(-1), [{ clip: 'pick_up' }, { clip: 'checking' }]);
    assert.equal(driver.guide(), 'idle');
  } finally {
    driver.stop();
  }
});

test('a triple press says help, like the word', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'help' }));
    await driver.heard('Help');
    const voiceLine = driver.spoken[driver.spoken.length - 1];
    driver.send({ type: 'BUTTON_PRESS', gesture: 'triple' });
    await driver.flush();
    assert.equal(driver.spoken[driver.spoken.length - 1], voiceLine);
  } finally {
    driver.stop();
  }
});

test('a hold stops, and any press wakes while stopped', async () => {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  try {
    driver.send({ type: 'BUTTON_PRESS', gesture: 'hold' });
    await driver.flush();
    assert.equal(driver.talk(), 'sleeping');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Stopped/);
    assert.equal(driver.context().holdSeen, true);
    driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Masaad water/);
    assert.equal(driver.context().routeAnswer?.intent, 'wake');
  } finally {
    driver.stop();
  }
});

test('a volume hold from paused wakes and repeats the last line', async () => {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  try {
    driver.setUnderstand(() => answer({ intent: 'stop' }));
    await driver.heard('Stop');
    await driver.advance(120000);
    assert.equal(driver.talk(), 'over');
    const pausing = driver.spoken[driver.spoken.length - 1] ?? '';
    driver.send({ type: 'BUTTON_PRESS', gesture: 'volumeHold' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.spoken[driver.spoken.length - 1], pausing);
  } finally {
    driver.stop();
  }
});

test('any earbud press wakes from paused', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'stop' }));
    await driver.heard('Stop');
    await driver.advance(120000);
    assert.equal(driver.talk(), 'over');
    driver.send({ type: 'BUTTON_PRESS', gesture: 'double' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
  } finally {
    driver.stop();
  }
});

test('a press interrupts understanding instead of waiting for it', async () => {
  resetStorage();
  const hanging = fromPromise<never, { transcript: string }>(() => new Promise<never>(() => undefined));
  const driver = startConversation({ understandLogic: hanging as never });
  try {
    await driver.start();
    driver.send({ type: 'FINAL_TEXT', text: 'Masaad water please' });
    await driver.flush();
    assert.equal(driver.talk(), 'understanding');
    driver.send({ type: 'BUTTON_PRESS', gesture: 'triple' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /You can say/);
  } finally {
    driver.stop();
  }
});

test('connecting earbuds says the button line once per connection', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.send({ type: 'EARBUD_STATE', connected: true });
    await driver.flush();
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /press once for yes, twice for no, hold to stop/);
    const count = driver.spoken.length;
    driver.send({ type: 'EARBUD_STATE', connected: true });
    await driver.flush();
    assert.equal(driver.spoken.length, count);
    driver.send({ type: 'EARBUD_STATE', connected: false });
    await driver.flush();
    driver.send({ type: 'EARBUD_STATE', connected: true });
    await driver.flush();
    assert.equal(driver.spoken.length, count + 1);
  } finally {
    driver.stop();
  }
});

test('help mentions the button only while earbuds are connected', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'help' }));
    await driver.heard('Help');
    assert.doesNotMatch(driver.spoken[driver.spoken.length - 1] ?? '', /press once for yes/);
    driver.send({ type: 'EARBUD_STATE', connected: true });
    await driver.flush();
    await driver.heard('Help');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /press once for yes, twice for no, hold to stop/);
  } finally {
    driver.stop();
  }
});

test('five presses without a hold teach the volume key once', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.send({ type: 'EARBUD_STATE', connected: true });
    await driver.flush();
    for (let press = 0; press < 4; press += 1) {
      driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
      await driver.flush();
    }
    assert.doesNotMatch(driver.spoken.join('\n'), /don't send a long press/);
    driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
    await driver.flush();
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /don't send a long press/);
    driver.send({ type: 'BUTTON_PRESS', gesture: 'double' });
    await driver.flush();
    assert.equal(driver.spoken.filter((line) => line.includes("don't send a long press")).length, 1);
  } finally {
    driver.stop();
  }
});

test('first launch teaches the volume key between privacy and the tour offer', async () => {
  resetStorage();
  const driver = await startListening({ firstLaunchDone: false, language: 'en' });
  try {
    driver.setUnderstand(() => answer({ intent: 'speak_language', target_language: 'en' }));
    await driver.heard('English');
    const lines = driver.spoken.join('\n');
    const privacyAt = lines.indexOf("I don't keep them");
    const volumeAt = lines.indexOf('hold the volume-down key');
    const tourAt = lines.indexOf('what my sounds mean');
    assert.ok(privacyAt >= 0 && volumeAt > privacyAt && tourAt > volumeAt);
  } finally {
    driver.stop();
  }
});
