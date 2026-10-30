// Walks the shelf search: it starts during "Is that right?", a "no"
// drops it at once, a pause stops it, and every shelf screen speaks
// its line with computed counts. Results heard mid-sentence wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { UnderstandAnswer } from '../src/relay';
import { resetStorage } from './stubs.mjs';

const BAGS = [
  { id: 0, frame: 0, box: { x1: 0, y1: 0, x2: 10, y2: 10, w: 20, h: 20, confidence: null } },
  { id: 1, frame: 0, box: { x1: 11, y1: 0, x2: 19, y2: 10, w: 20, h: 20, confidence: null } },
];

test('outlines speak the reading line with the counted kind once answered', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Basmati')
        ? answer({ intent: 'request_product', product_text: 'Riz Basmati' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Riz Basmati");
    driver.send({ type: 'SHELF_OUTLINED', outlines: BAGS, kind: 'bags' });
    await driver.flush();
    assert.equal(driver.context().outlines.length, 2);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Is that right/);
    await driver.heard('Yes');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /I see two bags\. Reading their labels/);
  } finally {
    driver.stop();
  }
});

test('a swept shelf states the counted check', async () => {
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
    driver.send({ type: 'SHELF_SWEPT', checked: 6 });
    await driver.flush();
    assert.match(
      driver.spoken[driver.spoken.length - 1] ?? '',
      /I checked six products\. Masaad water isn't here\. Say keep looking, or find another/,
    );
  } finally {
    driver.stop();
  }
});

test('moved outlines refresh silently, with no new line', async () => {
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
    driver.send({ type: 'SHELF_OUTLINED', outlines: BAGS, kind: 'bags' });
    await driver.flush();
    const said = driver.spoken.length;
    const moved = BAGS.map((outline) => ({ ...outline, box: { ...outline.box, x1: outline.box.x1 + 4 } }));
    driver.send({ type: 'OUTLINES_MOVED', outlines: moved });
    await driver.flush();
    assert.equal(driver.spoken.length, said);
    assert.equal(driver.context().outlines[0]?.box.x1, 4);
  } finally {
    driver.stop();
  }
});

test('a hand held up speaks checking before anything else', async () => {
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
    driver.send({ type: 'HAND_HOLD' });
    await driver.flush();
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /I'm checking/);
  } finally {
    driver.stop();
  }
});

test('where is it during a search says what it is doing', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.toLowerCase().includes('where')) {
        return answer({ intent: 'where_is_it' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    driver.send({ type: 'SHELF_OUTLINED', outlines: BAGS, kind: 'bags' });
    await driver.flush();
    await driver.heard('Where is it?');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /searching the shelf for Masaad water\. 2 products checked/);
  } finally {
    driver.stop();
  }
});

test('keep looking restarts the search with a fresh epoch', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.toLowerCase().includes('keep')) {
        return answer({ intent: 'keep_looking' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    const epoch = driver.context().searchEpoch;
    driver.send({ type: 'SHELF_SWEPT', checked: 6 });
    await driver.flush();
    await driver.heard('Keep looking');
    assert.equal(driver.search(), 'active');
    assert.ok(driver.context().searchEpoch > epoch);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /searching the shelf for Masaad water/);
  } finally {
    driver.stop();
  }
});

test('a pause stops the search and reopening resumes it', async () => {
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
    driver.send({ type: 'SHELF_OUTLINED', outlines: BAGS, kind: 'bags' });
    await driver.flush();
    assert.equal(driver.search(), 'active');
    driver.send({ type: 'PAUSE' });
    await driver.flush();
    assert.equal(driver.talk(), 'paused');
    assert.equal(driver.context().searching, false);
    assert.equal(driver.context().cameraOn, false);
    assert.equal(driver.context().outlines.length, 0);
    driver.send({ type: 'RESUME' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.search(), 'active');
    assert.equal(driver.context().cameraOn, true);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Welcome back.*Masaad water/);
  } finally {
    driver.stop();
  }
});

test('outlines heard mid-sentence wait until the answer is routed', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    let release!: (value: UnderstandAnswer) => void;
    const gated = new Promise<UnderstandAnswer>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    driver.setUnderstand(() => {
      calls += 1;
      return calls === 1 ? gated : answer({ intent: 'confirm_yes' });
    });
    const heard = driver.heard("I'm looking for Masaad water");
    await driver.flush();
    assert.equal(driver.talk(), 'understanding');
    driver.send({ type: 'SHELF_OUTLINED', outlines: BAGS, kind: 'bags' });
    await driver.flush();
    assert.equal(driver.context().outlines.length, 2);
    assert.doesNotMatch(driver.spoken[driver.spoken.length - 1] ?? '', /Reading their labels/);
    release(answer({ intent: 'request_product', product_text: 'Masaad water' }));
    await heard;
    await driver.flush();
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Is that right/);
    await driver.heard('Yes');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Reading their labels/);
  } finally {
    driver.stop();
  }
});

test('stopping drops the search at once', async () => {
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
    assert.equal(driver.search(), 'active');
    await driver.heard('stop');
    assert.equal(driver.talk(), 'sleeping');
    assert.equal(driver.search(), 'idle');
    assert.equal(driver.context().cameraOn, false);
  } finally {
    driver.stop();
  }
});

test('a no, a pause and a new request each retire the search epoch', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'confirm_no' });
    });
    await driver.heard("I'm looking for Masaad water");
    const first = driver.context().searchEpoch;
    assert.ok(first > 0);
    await driver.heard('No thanks');
    assert.ok(driver.context().searchEpoch > first);
    await driver.heard("I'm looking for Masaad water");
    const second = driver.context().searchEpoch;
    assert.ok(second > first);
    driver.send({ type: 'PAUSE' });
    await driver.flush();
    assert.ok(driver.context().searchEpoch > second);
  } finally {
    driver.stop();
  }
});
