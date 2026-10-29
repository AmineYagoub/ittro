// Confirmed brand names, heard better next time: saying yes
// remembers the words, and the next stream starts listening for
// them, in this session and after a relaunch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { loadPrefs } from '../src/store';
import { brandWords, mergeBrands, requestKeywords } from '../src/conversation/actors';
import { resetStorage } from './stubs.mjs';
import type { StreamCommand } from '../src/conversation/types';

function starts(commands: StreamCommand[]): StreamCommand[] {
  return commands.filter((command) => command.type === 'START');
}

test('saying yes remembers the brand and restarts the mic with it', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Yes') ? answer({ intent: 'confirm_yes' }) : answer({ intent: 'request_product', product_text: 'Masaad water' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    assert.deepEqual(driver.context().brands, ['Masaad', 'water']);
    assert.deepEqual((await loadPrefs()).brands, ['Masaad', 'water']);
    driver.streamCommands.length = 0;
    driver.send({ type: 'STREAM_CLOSED' });
    await driver.flush();
    const keywords = starts(driver.streamCommands).at(-1);
    assert.ok(keywords && keywords.type === 'START');
    assert.ok(keywords.keywords.includes('Masaad'));
    assert.ok(keywords.keywords.includes('water'));
  } finally {
    driver.stop();
  }
});

test('a yes in the hand remembers the label words', async () => {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  try {
    driver.send({ type: 'CONFIRM_BEGIN' });
    await driver.flush();
    driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water, 1.5 litres', crop: 'data:image/jpeg;base64,aGk=' });
    await driver.flush();
    assert.equal(driver.confirm(), 'yes');
    assert.ok(driver.context().brands.includes('Masaad'));
    assert.ok(driver.context().brands.includes('litres'));
    assert.ok((await loadPrefs()).brands.includes('Masaad'));
  } finally {
    driver.stop();
  }
});

test('keywords keep request words first and cap the list', () => {
  assert.deepEqual(requestKeywords('Masaad water', ['Masaad', 'Guedila']), ['Masaad', 'water', 'Guedila']);
  assert.deepEqual(requestKeywords(null, ['Guedila']), ['Guedila']);
  assert.deepEqual(brandWords('a 1.5 litres pack'), ['litres', 'pack']);
  assert.equal(mergeBrands([], 'one two three').length, 3);
  assert.equal(mergeBrands('w0 w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19'.split(' '), 'last word').length, 20);
});
