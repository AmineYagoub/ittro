// Speculative understanding: a partial transcript starts the relay
// early, and a matching final routes at once. The script counts its
// calls, so each test proves exactly when the relay is asked. A
// speculation never waits for good: an echo final or a final that
// never comes puts talk back to listening, with the clock running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';
import { DONE_CHIP, FIND_ANOTHER_CHIP } from '../src/chips';

test('a matching final routes on the speculated answer', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand((input) => {
      calls += 1;
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    assert.equal(calls, 1);
    await driver.partial('Yes.');
    assert.equal(driver.talk(), 'speculating');
    await driver.heard('Yes.');
    assert.equal(calls, 2);
    assert.equal(driver.context().request, 'Masaad water');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /searching the shelf for Masaad water/);
  } finally {
    driver.stop();
  }
});

test('a changed final understands again', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand((input) => {
      calls += 1;
      if (input.transcript.endsWith('water')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'not_understood' });
    });
    await driver.partial("I'm looking for Masaad");
    assert.equal(calls, 1);
    await driver.heard("I'm looking for Masaad water");
    assert.equal(calls, 2);
    assert.equal(driver.context().step, 'confirm');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Masaad water\. Is that right/);
  } finally {
    driver.stop();
  }
});

test('a fragment never starts understanding', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand((input) => {
      calls += 1;
      return answer({ intent: 'request_product', product_text: input.transcript });
    });
    await driver.partial('I');
    assert.equal(driver.talk(), 'listening');
    assert.equal(calls, 0);
    await driver.heard('I need oil');
    assert.equal(calls, 1);
  } finally {
    driver.stop();
  }
});

test('a pause drops the speculation', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand((input) => {
      calls += 1;
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.partial('Yes.');
    assert.equal(calls, 2);
    driver.send({ type: 'PAUSE' });
    await driver.flush();
    driver.send({ type: 'RESUME' });
    await driver.flush();
    await driver.heard('Yes.');
    assert.equal(calls, 3);
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
});

test('speech during silence restarts the clock without nagging', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'not_understood' }));
    await driver.advance(7000);
    await driver.partial("I'm looking for Masaad");
    const afterPartial = driver.spoken.length;
    await driver.advance(7000);
    assert.equal(driver.spoken.length, afterPartial);
  } finally {
    driver.stop();
  }
});

test('a short yes routes before the final arrives', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand((input) => {
      calls += 1;
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.partial('Yes,');
    assert.equal(driver.talk(), 'speculating');
    await driver.advance(900);
    assert.equal(calls, 2);
    assert.equal(driver.context().request, 'Masaad water');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /searching the shelf for Masaad water/);
  } finally {
    driver.stop();
  }
});

test('the final of an early-routed yes is not understood twice', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand((input) => {
      calls += 1;
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.partial('Yes,');
    await driver.advance(900);
    assert.equal(calls, 2);
    const said = driver.spoken.length;
    await driver.heard('Yes,');
    assert.equal(calls, 2, 'the same final is dropped');
    assert.equal(driver.spoken.length, said);
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
});

test('a no waits for the final, so corrections survive', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.includes('big one')) {
        return answer({ intent: 'confirm_no', product_text: 'the big one' });
      }
      return answer({ intent: 'confirm_no' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.partial('No, the');
    assert.equal(driver.talk(), 'speculating');
    await driver.advance(900);
    assert.equal(driver.talk(), 'speculating');
    await driver.heard('No, the big one');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /the big one\. Is that right/);
  } finally {
    driver.stop();
  }
});

test('speech end routes a ready yes at once', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.partial('Yes,');
    driver.send({ type: 'SPEECH_ENDED' });
    await driver.flush();
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
});

test('an offered choice said while its first word is understood is heard (t21)', async () => {
  resetStorage();
  const driver = await startListening({ language: 'ar' });
  try {
    driver.setUnderstand((input) => {
      const ar = { language_spoken: 'ar' };
      if (input.transcript.includes('مسعد')) {
        return answer({ ...ar, intent: 'request_product', product_text: 'ماء مسعد' });
      }
      return answer({ ...ar, intent: input.transcript.startsWith('ابحث') ? 'find_another' : 'confirm_yes' });
    });
    await driver.heard('أبحث عن ماء مسعد');
    await driver.heard('نعم');
    const target = { id: 7, frame: 3, box: { x1: 800, y1: 400, x2: 1000, y2: 640, w: 1280, h: 960, confidence: null } };
    driver.send({ type: 'SHELF_FOUND', product: 'ماء مسعد', outline: target, matches: 1, kind: 'bottles', position: 'left' });
    await driver.flush();
    driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 900, y: 520 } });
    await driver.flush();
    driver.send({ type: 'GUIDE_GOT_IT' });
    await driver.flush();
    driver.send({ type: 'CONFIRM_YES', epoch: driver.context().confirmEpoch, label: 'ماء مسعد', crop: 'crop' });
    await driver.flush();
    assert.deepEqual(driver.context().lastChips, [FIND_ANOTHER_CHIP.ar, DONE_CHIP.ar]);
    await driver.partial('ابحث');
    assert.equal(driver.talk(), 'speculating');
    await driver.heard(FIND_ANOTHER_CHIP.ar);
    assert.equal(driver.context().request, null);
    assert.equal(driver.talk(), 'listening');
  } finally {
    driver.stop();
  }
});

test('an echo final ends the speculation and the clock runs again', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'not_understood' }));
    const welcome = driver.context().lastLine;
    await driver.partial('Masaad');
    assert.equal(driver.talk(), 'speculating');
    await driver.heard(welcome);
    assert.equal(driver.talk(), 'listening');
    const said = driver.spoken.length;
    await driver.advance(8000);
    assert.ok(driver.spoken.length > said, 'Ittro asks again');
  } finally {
    driver.stop();
  }
});

test('a speculation whose final never comes listens again', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'not_understood' }));
    await driver.partial("I'm looking for Masaad");
    assert.equal(driver.talk(), 'speculating');
    await driver.advance(5000);
    await driver.partial("I'm looking for Masaad water");
    await driver.advance(5000);
    assert.equal(driver.talk(), 'speculating', 'a newer partial restarts the wait');
    await driver.advance(1500);
    assert.equal(driver.talk(), 'listening');
    const said = driver.spoken.length;
    await driver.advance(8000);
    assert.ok(driver.spoken.length > said, 'Ittro asks again');
  } finally {
    driver.stop();
  }
});
