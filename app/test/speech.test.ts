// A spoken line never blocks Ittro forever, and it is never said
// twice: say and sayClip both resolve when the platform answers,
// when the engine already played the line, and when it never does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playSound, say, sayClip } from '../src/speech';
import { warmVoice } from '../src/speechWarm';
import { setLogsOverride } from '../src/log';
import {
  audioPlayers,
  resetSpeech,
  setSpeechHang,
  setSpeechScript,
  setSpeechSpeaking,
  speechCalls,
  speechStops,
  voiceQueries,
} from './stubs.mjs';

async function settles(promise: Promise<void>, ms: number): Promise<boolean> {
  let finished = false;
  const timeout = new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.race([promise.then(() => {
    finished = true;
  }), timeout]);
  return finished;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

test('say tries once more, then carries on when the engine drops the line', async () => {
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

test('say says the line again once after the engine drops it', async () => {
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

test('say says the line once when the engine played it but lost the callback', async () => {
  resetSpeech();
  setSpeechHang(true);
  setSpeechSpeaking(true);
  try {
    const said = say('hi', 'en');
    await sleep(300);
    setSpeechSpeaking(false);
    assert.equal(await settles(said, 3000), true);
    assert.equal(speechCalls.length, 1);
  } finally {
    resetSpeech();
  }
});

test('say waits for a slow engine instead of saying the line twice', async () => {
  resetSpeech();
  setSpeechHang(true);
  setSpeechSpeaking(true);
  try {
    const said = say('hi', 'en');
    setTimeout(() => setSpeechSpeaking(false), 1300);
    assert.equal(await settles(said, 4000), true);
    assert.equal(speechCalls.length, 1);
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

test('sayClip ends when the clip finishes', async () => {
  resetSpeech();
  try {
    const played = sayClip('testcue', 'en');
    await sleep(100);
    const player = audioPlayers[audioPlayers.length - 1] as { finish: () => void } | undefined;
    player?.finish();
    assert.equal(await settles(played, 2000), true);
  } finally {
    resetSpeech();
  }
});

test('a tick during a cue leaves the cue playing (t54)', async () => {
  resetSpeech();
  try {
    const played = sayClip('testcue', 'en');
    await sleep(100);
    const cue = audioPlayers[audioPlayers.length - 1] as { playing: boolean; finish: () => void } | undefined;
    playSound('proximityTick');
    await sleep(500);
    assert.equal(cue?.playing, true, 'the tick did not stop the cue');
    assert.equal(await settles(played, 50), false, 'the cue is still being said');
    cue?.finish();
    assert.equal(await settles(played, 2000), true);
  } finally {
    resetSpeech();
  }
});

test('sayClip ends when the player stops even without its event', async () => {
  resetSpeech();
  try {
    const played = sayClip('testcue', 'en');
    await sleep(100);
    const player = audioPlayers[audioPlayers.length - 1] as { playing: boolean } | undefined;
    if (player) {
      player.playing = false;
    }
    assert.equal(await settles(played, 2000), true);
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

test('say logs when speech starts', async () => {
  resetSpeech();
  const printed: string[] = [];
  const realLog = console.log;
  console.log = (...args: unknown[]): void => {
    printed.push(args.map((part) => String(part)).join(' '));
  };
  try {
    setLogsOverride(true);
    assert.equal(await settles(say('hi', 'en'), 2000), true);
  } finally {
    console.log = realLog;
    setLogsOverride(null);
    resetSpeech();
  }
  assert.ok(printed.some((line) => /say started \d+ms/.test(line)));
});

test('warmVoice asks the engine for voices once per language', async () => {
  resetSpeech();
  const printed: string[] = [];
  const realLog = console.log;
  console.log = (...args: unknown[]): void => {
    printed.push(args.map((part) => String(part)).join(' '));
  };
  try {
    setLogsOverride(true);
    warmVoice('ar');
    warmVoice('ar');
    warmVoice('en');
    await sleep(50);
    assert.equal(voiceQueries.length, 2);
    assert.ok(printed.some((line) => /voice ready ar \(1 voices\)/.test(line)));
  } finally {
    console.log = realLog;
    setLogsOverride(null);
    resetSpeech();
  }
});
