// The voice gate: while Ittro speaks and for a tail after, the mic
// uplink carries silence, so its own voice never comes back as a
// transcript. The gate follows the audio the speaker actually
// plays, not the promise: a late engine start re-closes it, and it
// holds while the engine still reports speaking. The stream itself
// stays open the whole time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_TAIL_MS, voiceGateClosed } from '../src/voiceGate';
import { say } from '../src/speech';
import { speechBudgetMs } from '../src/speechEngine';
import { uplinkFrame } from '../src/conversation/micStats';
import { resetSpeech, setSpeechScript, setSpeechSpeaking } from './stubs.mjs';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('the gate holds while the engine still reports speaking after done', async () => {
  resetSpeech();
  setSpeechSpeaking(true);
  await say('hi', 'en');
  await sleep(900);
  assert.equal(voiceGateClosed(Date.now()), true, 'held past the plain tail by the engine');
  setSpeechSpeaking(false);
  await sleep(VOICE_TAIL_MS + 900);
  assert.equal(voiceGateClosed(Date.now()), false);
});

test('the gate closes while a line speaks and for a tail after it', async () => {
  resetSpeech();
  const text = 'Searching the shelf for Masaad water.';
  assert.equal(voiceGateClosed(Date.now() + VOICE_TAIL_MS + 1), false);
  const line = say(text, 'en');
  assert.equal(voiceGateClosed(), true, 'closed as soon as the line starts');
  await line;
  const now = Date.now();
  assert.equal(voiceGateClosed(now), true, 'still closed inside the tail');
  assert.equal(
    voiceGateClosed(now + speechBudgetMs(text) + VOICE_TAIL_MS + 1),
    false,
    'open after the audio and the tail',
  );
});

test('a closed gate sends silence in place of the room', () => {
  const silence = new Uint8Array(4);
  const heard = new Uint8Array([1, 2, 3, 4]);
  assert.equal(uplinkFrame(heard, silence, true), silence);
  assert.equal(uplinkFrame(heard, silence, false), heard);
  assert.equal(uplinkFrame(null, silence, false), silence);
});

test('a late engine start after done keeps the gate closed through the audio', async () => {
  resetSpeech();
  setSpeechScript(['late']);
  const text = 'Welcome back. Still looking for Masaad water.';
  await say(text, 'en');
  await sleep(50);
  const heard = Date.now();
  assert.equal(voiceGateClosed(heard), true, 're-closed by the late start');
  assert.equal(voiceGateClosed(heard + speechBudgetMs(text)), true, 'closed through the played audio');
  assert.equal(voiceGateClosed(heard + speechBudgetMs(text) + VOICE_TAIL_MS + 5000), false);
});
