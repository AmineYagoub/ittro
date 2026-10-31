// The voice gate: while Ittro speaks and for 300 ms after, the mic
// uplink carries silence, so its own voice never comes back as a
// transcript. The stream itself stays open the whole time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_TAIL_MS, say, voiceGateClosed } from '../src/speech';
import { uplinkFrame } from '../src/conversation/micStats';
import { resetSpeech } from './stubs.mjs';

test('the gate closes while a line speaks and for a tail after it', async () => {
  resetSpeech();
  assert.equal(voiceGateClosed(Date.now() + VOICE_TAIL_MS + 1), false);
  const line = say('Searching the shelf for Masaad water.', 'en');
  assert.equal(voiceGateClosed(), true, 'closed as soon as the line starts');
  await line;
  const now = Date.now();
  assert.equal(voiceGateClosed(now), true, 'still closed inside the tail');
  assert.equal(voiceGateClosed(now + VOICE_TAIL_MS + 1), false, 'open after the tail');
});

test('a closed gate sends silence in place of the room', () => {
  const silence = new Uint8Array(4);
  const heard = new Uint8Array([1, 2, 3, 4]);
  assert.equal(uplinkFrame(heard, silence, true), silence);
  assert.equal(uplinkFrame(heard, silence, false), heard);
  assert.equal(uplinkFrame(null, silence, false), silence);
});
