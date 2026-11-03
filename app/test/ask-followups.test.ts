// Questions next to a running search, from the 1 November review: a
// follow-up without an offer frees the search's queued lines, the view
// offer is kept apart from the search's own offer and survives a find,
// yes drops the old search's lines, speech while asking is understood,
// a follow-up keeps the camera, silence and the earbud treat the offer
// like every other, the acknowledgement waits for the earcon and never
// plays asleep, and a question gets no answer meant for its first words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { audioPlayers, resetSpeech, resetStorage, soundAsset, speechCalls } from './stubs.mjs';
import { forgetAck } from '../src/conversation/askView';
import { forgetStills, keepStill } from '../src/shelf/stills';
import type { UnderstandAnswer } from '../src/relay';

const HONEY = { answer: 'Yes, honey jars on the lower shelf.', offer: 'Medina honey', unreadable: [] };

const ACKS = /^(Let me look|One moment|Let me see)…$/;

async function searchingBasmati() {
  resetStorage();
  const driver = await startListening();
  driver.setUnderstand((input) => {
    if (input.transcript.includes('basmati')) {
      return answer({ intent: 'request_product', product_text: 'basmati' });
    }
    if (input.transcript === 'Yes') {
      return answer({ intent: 'confirm_yes' });
    }
    if (input.transcript === 'Stop') {
      return answer({ intent: 'stop' });
    }
    return answer({ intent: 'ask_view', question: input.transcript });
  });
  await driver.heard("I'm looking for basmati");
  await driver.heard('Yes');
  assert.equal(driver.search(), 'active');
  return driver;
}

test('a follow-up answered without an offer closes the offer, so the search speaks again', async () => {
  const driver = await searchingBasmati();
  try {
    let asked = 0;
    driver.setAsk(() => (asked++ === 0 ? HONEY : { answer: 'The honey is 450 dinars.', offer: null, unreadable: [] }));
    await driver.heard('Is there honey?');
    await driver.heard('How much is the honey?');
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.context().pendingQuestion, null);
    driver.send({ type: 'NO_SHELF', floor: true });
    await driver.flush();
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /floor/);
  } finally {
    driver.stop();
  }
});

test('the view offer stays its own when the search offers or finds something meanwhile', async () => {
  const driver = await searchingBasmati();
  try {
    driver.setAsk(() => HONEY);
    await driver.heard('Is there honey?');
    driver.send({ type: 'NOT_HERE', wanted: 'basmati', answer: 'No basmati on this shelf.', offer: 'white rice', checked: 6, whole: true });
    driver.send({
      type: 'SHELF_FOUND',
      product: 'basmati',
      outline: { id: 1, frame: 1, box: { x1: 0, y1: 0, x2: 10, y2: 10, w: 10, h: 10, confidence: null } },
      matches: 1,
      kind: 'bags',
      position: 'left',
    });
    await driver.flush();
    await driver.heard('Yes');
    assert.equal(driver.context().request, 'Medina honey');
  } finally {
    driver.stop();
  }
});

test('yes to the view offer drops the lines the old search had queued', async () => {
  const driver = await searchingBasmati();
  try {
    driver.setAsk(() => HONEY);
    await driver.heard('Is there honey?');
    driver.send({ type: 'SWEEP_CUE', cue: 'left', product: 'basmati' });
    await driver.flush();
    await driver.heard('Yes');
    await driver.flush();
    assert.equal(driver.spoken[driver.spoken.length - 1], 'Looking for Medina honey.');
    assert.deepEqual(driver.context().pendingSearch, []);
  } finally {
    driver.stop();
  }
});

test('"stop" said while an answer is on its way is understood', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => (input.transcript === 'Stop' ? answer({ intent: 'stop' }) : answer({ intent: 'ask_view', question: input.transcript })));
    driver.setAsk(() => new Promise(() => undefined));
    await driver.heard("What's here?");
    assert.equal(driver.talk(), 'asking');
    await driver.heard('Stop');
    assert.equal(driver.context().step, 'sleep');
  } finally {
    driver.stop();
  }
});

test('a follow-up keeps the camera the first question opened', async () => {
  resetStorage();
  resetSpeech();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => answer({ intent: 'ask_view', question: input.transcript }));
    driver.setAsk(() => ({ answer: 'On this shelf I see white rice and basmati.', offer: null, unreadable: [] }));
    await driver.heard("What's here?");
    await driver.advance(8000);
    await driver.heard('Which is cheaper?');
    const points = speechCalls.filter((call: { text: string }) => call.text === 'Point the phone at the shelf.');
    assert.equal(points.length, 1);
  } finally {
    driver.stop();
  }
});

test('silence after the view offer asks yes or no again, and the earbud means yes', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => answer({ intent: 'ask_view', question: input.transcript }));
    driver.setAsk(() => HONEY);
    await driver.heard('Is there honey?');
    assert.equal(driver.context().step, 'viewOffer');
    await driver.advance(8000);
    assert.deepEqual(driver.context().lastChips, ['yes', 'no']);
    driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
    await driver.flush();
    assert.equal(driver.context().request, 'Medina honey');
  } finally {
    driver.stop();
  }
});

test('asleep, an overheard question gets no acknowledgement', async () => {
  resetStorage();
  keepStill({ image: 'shelf', mime: 'image/jpeg', w: 960, h: 1280, at: Date.now() });
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => (input.transcript === 'Stop' ? answer({ intent: 'stop' }) : answer({ intent: 'not_understood' })));
    await driver.heard('Stop');
    forgetAck();
    resetSpeech();
    await driver.heard('What time is it?');
    await new Promise((done) => setTimeout(done, 200));
    assert.equal(speechCalls.filter((call: { text: string }) => ACKS.test(call.text)).length, 0);
  } finally {
    forgetStills();
    driver.stop();
  }
});

test('the acknowledgement lets the heard earcon play first', async () => {
  resetStorage();
  keepStill({ image: 'shelf', mime: 'image/jpeg', w: 960, h: 1280, at: Date.now() });
  const driver = await startListening();
  try {
    (soundAsset as Record<string, unknown>)['heard'] = 7;
    driver.setUnderstand((input) => answer({ intent: 'ask_view', question: input.transcript }));
    driver.setAsk(() => new Promise(() => undefined));
    await driver.partial("What's here on this shelf?");
    forgetAck();
    resetSpeech();
    driver.send({ type: 'SPEECH_ENDED' });
    await driver.flush();
    const heard = audioPlayers[0] as { playing: boolean } | undefined;
    assert.equal(heard?.playing, true);
    await new Promise((done) => setTimeout(done, 200));
    assert.equal(speechCalls.filter((call: { text: string }) => ACKS.test(call.text)).length, 1);
  } finally {
    delete (soundAsset as Record<string, unknown>)['heard'];
    forgetStills();
    driver.stop();
  }
});

test('a question is never answered with the answer to its first words', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    const calls: string[] = [];
    let release: (value: UnderstandAnswer) => void = () => undefined;
    driver.setUnderstand((input) => {
      calls.push(input.transcript);
      if (calls.length === 1) {
        return new Promise<UnderstandAnswer>((done) => {
          release = done;
        });
      }
      return answer({ intent: 'ask_view', question: input.transcript, view: { answer: 'No honey on this shelf.', offer: null, unreadable: [] } });
    });
    await driver.partial('Is there');
    await driver.partial('Is there honey?');
    release(answer({ intent: 'ask_view', question: 'Is there', view: { answer: 'On this shelf I see white rice and beans.', offer: null, unreadable: [] } }));
    await driver.flush();
    await driver.heard('Is there honey?');
    assert.equal(driver.spoken[driver.spoken.length - 1], 'No honey on this shelf.');
    assert.equal(calls[calls.length - 1], 'Is there honey?');
  } finally {
    driver.stop();
  }
});
