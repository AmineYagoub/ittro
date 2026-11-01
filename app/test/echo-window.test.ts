// Fresh voice is never the shopper: the playing line's first
// words never reach understanding, a just-played clip stays echo
// after the line moves on, and a bare yes is the shopper's only
// while its question is open; a choice Ittro offered is the
// shopper's once Ittro is quiet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { echoFull } from '../src/conversation/echo';
import { cueText } from '../src/voiceClips';
import { resetSpeech, speechStops } from './stubs.mjs';

test('the first words of the playing line never reach understanding', async () => {
  resetSpeech();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'request_product', product_text: 'Masaad water' }));
    driver.holdSpeech(true);
    await driver.heard('Masaad water');
    assert.equal(driver.talk(), 'saying');
    let calls = 0;
    driver.setUnderstand(() => {
      calls += 1;
      return answer({ intent: 'ignore' });
    });
    await driver.partial('You asked');
    assert.equal(driver.talk(), 'saying');
    assert.equal(calls, 0);
    assert.equal(speechStops.length, 0);
    driver.holdSpeech(false);
  } finally {
    driver.stop();
    resetSpeech();
  }
});

test('a just-played clip is echo even after the line moved on', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  try {
    let calls = 0;
    driver.setUnderstand(() => {
      calls += 1;
      return answer({ intent: 'ignore' });
    });
    const target = { id: 1, frame: 1, box: { x1: 0, y1: 0, x2: 10, y2: 10, w: 20, h: 20, confidence: null } };
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: target, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    driver.send({ type: 'GUIDE_LOST' });
    await driver.flush();
    driver.send({ type: 'GUIDE_CUE', cue: 'hand_right', proximity: 0.5, hand: { x: 1, y: 1 } });
    await driver.flush();
    await driver.heard(cueText.hand_lost.en);
    assert.equal(calls, 0);
    assert.equal(driver.talk(), 'listening');
  } finally {
    driver.stop();
  }
});

test('a yes answering the question is heard despite an old yes line', async () => {
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.includes('Elio')) {
        return answer({ intent: 'request_product', product_text: 'Elio oil' });
      }
      if (input.transcript.includes('another')) {
        return answer({ intent: 'find_another' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    await driver.heard('find another');
    await driver.heard("I'm looking for Elio oil");
    await driver.heard('Yes');
    assert.equal(driver.context().request, 'Elio oil');
  } finally {
    driver.stop();
  }
});

test('an old line no longer swallows its first word', async () => {
  const driver = await startListening();
  try {
    const base = driver.context();
    const heard = { type: 'FINAL_TEXT', text: 'still' } as const;
    assert.equal(echoFull({ context: { ...base, voiceAt: 0, voiceLog: [], lastLine: 'Still looking for Masaad water.' }, event: heard }), false);
    assert.equal(
      echoFull({
        context: { ...base, voiceAt: Date.now(), voiceLog: [], lastLine: 'Still looking for Masaad water.' },
        event: heard,
      }),
      true,
    );
  } finally {
    driver.stop();
  }
});

test('a bare yes is the shopper only while its question is open', async () => {
  const driver = await startListening();
  try {
    const base = driver.context();
    const heard = { type: 'FINAL_TEXT', text: 'Yes' } as const;
    const past = [{ text: "Yes. I'm searching the shelf for Masaad water.", at: Date.now() }];
    assert.equal(
      echoFull({
        context: {
          ...base,
          voiceAt: Date.now(),
          voiceLog: past,
          lastLine: 'You asked for Elio oil. Is that right? Say yes or no.',
          pendingQuestion: 'confirm_request',
        },
        event: heard,
      }),
      false,
    );
    assert.equal(
      echoFull({
        context: {
          ...base,
          voiceAt: Date.now(),
          voiceLog: past,
          lastLine: 'You asked for Elio oil. Is that right? Say yes or no.',
          pendingQuestion: null,
        },
        event: heard,
      }),
      true,
    );
  } finally {
    driver.stop();
  }
});

test('an offered choice said back while Ittro is quiet is the shopper (t12)', async () => {
  const driver = await startListening();
  try {
    const base = driver.context();
    const heard = { type: 'FINAL_TEXT', text: 'ابحث عن غيره' } as const;
    const offered = {
      ...base,
      lang: 'ar' as const,
      voiceAt: Date.now(),
      voiceLog: [{ text: 'قل ابحث عن غيره، أو انتهيت.', at: Date.now() }],
      lastLine: 'نعم. هذا مسعد ماء. قل ابحث عن غيره، أو انتهيت.',
      lastChips: ['ابحث عن غيره', 'انتهيت'],
    };
    assert.equal(echoFull({ context: { ...offered, talkBusy: false }, event: heard }), false);
    assert.equal(echoFull({ context: { ...offered, talkBusy: true }, event: heard }), true);
  } finally {
    driver.stop();
  }
});
