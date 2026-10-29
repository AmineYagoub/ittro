// A spoken line never blocks Ittro forever: say and sayClip both
// resolve when the platform answers and when it never does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { say, sayClip } from '../src/speech';
import { resetSpeech, setSpeechHang, setSpeechScript, speechCalls, speechStops } from './stubs.mjs';

async function settles(promise: Promise<void>, ms: number): Promise<boolean> {
  let finished = false;
  const timeout = new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.race([promise.then(() => {
    finished = true;
  }), timeout]);
  return finished;
}

test('say resolves when speech finishes', async () => {
  resetSpeech();
  try {
    assert.equal(await settles(say('hi', 'en'), 2000), true);
    assert.equal(speechCalls.length, 1);
    assert.equal(speechCalls[0]?.text, 'hi');
  } finally {
    resetSpeech();
  }
});

test('say tries once more, then carries on when speech never finishes', async () => {
  resetSpeech();
  setSpeechHang(true);
  try {
    assert.equal(await settles(say('hi', 'en'), 3000), true);
    assert.equal(speechCalls.length, 2);
    assert.equal(speechCalls[0]?.text, 'hi');
    assert.equal(speechCalls[1]?.text, 'hi');
  } finally {
    resetSpeech();
  }
});

test('say says the line again once after a timeout', async () => {
  resetSpeech();
  setSpeechScript(['hang', 'ok']);
  try {
    assert.equal(await settles(say('hi', 'en'), 3000), true);
    assert.equal(speechCalls.length, 2);
  } finally {
    resetSpeech();
  }
});

test('say says the line again once after an error', async () => {
  resetSpeech();
  setSpeechScript(['error', 'ok']);
  try {
    assert.equal(await settles(say('hi', 'en'), 3000), true);
    assert.equal(speechCalls.length, 2);
  } finally {
    resetSpeech();
  }
});

test('say carries on when the retry fails too', async () => {
  resetSpeech();
  setSpeechScript(['error', 'error']);
  try {
    assert.equal(await settles(say('hi', 'en'), 3000), true);
    assert.equal(speechCalls.length, 2);
  } finally {
    resetSpeech();
  }
});

test('a superseded say neither retries nor stops the new line', async () => {
  resetSpeech();
  setSpeechScript(['hang', 'ok']);
  try {
    const first = say('first', 'en');
    await settles(say('second', 'en'), 2000);
    assert.equal(await settles(first, 3000), true);
    assert.equal(speechCalls.length, 2);
    assert.equal(speechCalls[1]?.text, 'second');
    assert.equal(speechStops.length, 2);
  } finally {
    resetSpeech();
  }
});

test('sayClip carries on when the clip never finishes', async () => {
  resetSpeech();
  try {
    assert.equal(await settles(sayClip('testcue', 'en'), 11000), true);
  } finally {
    resetSpeech();
  }
});
