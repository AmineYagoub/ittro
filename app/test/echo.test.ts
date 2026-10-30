// Telling Ittro's voice from the shopper's, word by word: Arabic
// diacritics and hamza never hide an echo, a line's first words are
// its echo while it plays, and a near-verbatim echo with a
// transcription wobble still drops. Short shopper answers stay the
// shopper's, even mid-line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { transcriptFate } from '../src/conversation/echo';

const NO_LINE = 'No. This is Guedila bottle. Put it back. Say guide me, or read again.';

test('arabic diacritics never hide a clip echo', () => {
  assert.deepEqual(transcriptFate('حرك يدك قليلا الى اليمين', ['حرّك يدك قليلًا إلى اليمين.']), { echo: true });
});

test('arabic hamza never hides a clip echo', () => {
  assert.deepEqual(transcriptFate('لم اعد ارى يدك', ['لم أعد أرى يدك. أبقِ يدك ثابتة.']), { echo: true });
});

test('the first word of a playing line is echo, not a request', () => {
  const own = ['Welcome back. Still looking for Masaad water, the big bottle.'];
  assert.equal(transcriptFate('still', own, false).echo, false);
  assert.deepEqual(transcriptFate('still', own, true), { echo: true });
  assert.deepEqual(transcriptFate('What', ['What are you looking for?'], true), { echo: true });
  assert.deepEqual(transcriptFate('I found', ['I found Masaad water in the middle.'], true), { echo: true });
  assert.deepEqual(transcriptFate('طلبت', ['طلبت قرورة ماء مسعد. هل هذا صحيح؟ قل نعم أو لا.'], true), { echo: true });
  assert.deepEqual(transcriptFate('وجدت', ['وجدت قرورة ماء مسعد في الوسط.'], true), { echo: true });
  assert.deepEqual(transcriptFate('قرورة', ['قرورة ماء مسعد خارج الصورة.'], true), { echo: true });
});

test('a mistranscribed start of a playing line is echo', () => {
  assert.deepEqual(transcriptFate('نعم تبحث', ['نعم. أبحث عن قرورة ماء مسعد على الرف.'], true), { echo: true });
});

test('a near-verbatim echo with a wobble still drops', () => {
  assert.deepEqual(transcriptFate('نعم تبحث عن قرورة ماء', ['نعم. أبحث عن قرورة ماء مسعد على الرف.'], true), { echo: true });
  assert.deepEqual(transcriptFate('I found Massad water in the middle.', ['I found Masaad water in the middle.'], true), {
    echo: true,
  });
});

test('short shopper answers stay the shopper, even mid-line', () => {
  assert.deepEqual(transcriptFate('Guide me', [NO_LINE], true), { echo: false, text: 'Guide me', stripped: false });
  assert.deepEqual(transcriptFate('yes', ['You asked for Masaad water. Is that right? Say yes or no.'], true), {
    echo: false,
    text: 'yes',
    stripped: false,
  });
  assert.deepEqual(transcriptFate('Masaad water', ['Welcome back. Still looking for Masaad water, the big bottle.'], true), {
    echo: false,
    text: 'Masaad water',
    stripped: false,
  });
  assert.deepEqual(
    transcriptFate('read the date', ['I can’t confirm yet. I can read Masaad, but not the size. Turn it slowly.'], true),
    { echo: false, text: 'read the date', stripped: false },
  );
  assert.deepEqual(transcriptFate('Is this the right one', ['Is that right? Say yes or no.'], true), {
    echo: false,
    text: 'Is this the right one',
    stripped: false,
  });
  assert.deepEqual(
    transcriptFate("I'm looking for Masaad", ["Hi, I'm Ittro. Tell me what you're looking for, or say help."], true),
    { echo: false, text: "I'm looking for Masaad", stripped: false },
  );
});
