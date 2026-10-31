// The shelf phrase is asked once per product and kept: the second
// search of the same product starts without the 2 s Spark call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedPhrase, forgetPhrasesForTest } from '../src/shelf/phraseCache';
import { resetStorage } from './stubs.mjs';

test('a product asked twice costs one phrase call', async () => {
  resetStorage();
  forgetPhrasesForTest();
  let calls = 0;
  const fetchPhrase = async (): Promise<string> => {
    calls += 1;
    return 'bottle';
  };
  assert.equal(await cachedPhrase('Masaad water', 'img', 'image/jpeg', fetchPhrase), 'bottle');
  assert.equal(await cachedPhrase(' masaad water ', 'img', 'image/jpeg', fetchPhrase), 'bottle');
  assert.equal(calls, 1);
});

test('the phrase survives a relaunch', async () => {
  resetStorage();
  forgetPhrasesForTest();
  await cachedPhrase('ماء مسعد', 'img', 'image/jpeg', async () => 'bottle');
  forgetPhrasesForTest();
  let calls = 0;
  const again = await cachedPhrase('ماء مسعد', 'img', 'image/jpeg', async () => {
    calls += 1;
    return 'carton';
  });
  assert.equal(again, 'bottle');
  assert.equal(calls, 0);
});
