// A find reaches the shopper fast: found before yes is announced
// right after it, later outlines queue nothing stale, a find drops
// the close alternative, and arming never talks over a live line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';

const BAGS = [
  { id: 0, frame: 0, box: { x1: 0, y1: 0, x2: 10, y2: 10, w: 20, h: 20, confidence: null } },
  { id: 1, frame: 0, box: { x1: 11, y1: 0, x2: 19, y2: 10, w: 20, h: 20, confidence: null } },
];

test('a find before yes is announced right after yes, with no searching line', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water");
    driver.send({ type: 'SHELF_OUTLINED', outlines: BAGS, kind: 'bottles' });
    await driver.flush();
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: BAGS[0] as never, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    await driver.heard('Yes');
    assert.ok(!driver.spoken.some((line) => /searching the shelf/.test(line)));
    assert.equal(driver.context().lastLine, 'I found Masaad water in the middle.');
    assert.equal(driver.guide(), 'aiming');
  } finally {
    driver.stop();
  }
});

test('outlines after the find queue no reading line', async () => {
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
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: BAGS[0] as never, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    driver.send({ type: 'SHELF_OUTLINED', outlines: BAGS, kind: 'bottles' });
    await driver.flush();
    assert.equal(driver.context().pendingSearch.length, 0);
    assert.ok(!driver.spoken.some((line) => /Reading their labels/.test(line)));
  } finally {
    driver.stop();
  }
});

test('a find drops the close alternative and guides to the request', async () => {
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
    driver.send({ type: 'CLOSE_MATCH', wanted: 'Masaad water', found: 'Guedila water' });
    await driver.flush();
    assert.equal(driver.context().step, 'alternative');
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: BAGS[0] as never, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.context().alternative, null);
    assert.equal(driver.context().pendingQuestion, null);
    assert.equal(driver.guide(), 'aiming');
  } finally {
    driver.stop();
  }
});

test('arming waits for a free moment instead of talking over it', async () => {
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
    driver.holdSpeech(true);
    await driver.heard('Where is it?');
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: BAGS[0] as never, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.equal(driver.guide(), 'arming');
    driver.send({ type: 'LINK_DOWN' });
    await driver.flush();
    await driver.advance(10000);
    assert.equal(driver.guide(), 'arming');
    driver.holdSpeech(false);
    await driver.flush();
    assert.equal(driver.guide(), 'aiming');
    assert.ok(driver.spoken.some((line) => /lost the internet/.test(line)));
    assert.equal(driver.context().lastLine, 'I found Masaad water in the middle.');
  } finally {
    driver.stop();
  }
});
