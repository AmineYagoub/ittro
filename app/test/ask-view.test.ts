// Questions about what the camera sees (shelf-awareness plan steps 3
// and 4): an answer from the understanding call is said at once; else
// asking opens the camera if needed, asks with the hints, and says the
// answer, the timeout or why there is no picture. A named product is
// offered; yes starts the normal find, no leaves things as they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetSpeech, resetStorage, speechCalls } from './stubs.mjs';
import { NoStillError, forgetAck } from '../src/conversation/askView';

const WHAT = answer({ intent: 'ask_view', question: "what's here?" });

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('an answer from the understanding call is said at once, with no second call', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'ask_view', question: "what's here?", view: { answer: 'On this shelf I see white rice.', offer: null, unreadable: [] } }));
    await driver.heard("What's here?");
    assert.equal(driver.asked.length, 0);
    assert.equal(driver.spoken[driver.spoken.length - 1], 'On this shelf I see white rice.');
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.context().viewHistory[0]?.heard, true);
  } finally {
    driver.stop();
  }
});

test('without an answer, asking opens the camera, asks with the hints, then closes it', async () => {
  resetStorage();
  const driver = await startListening();
  const reply = deferred<{ answer: string; offer: string | null; unreadable: string[] }>();
  try {
    driver.setUnderstand(() => WHAT);
    driver.setAsk(() => reply.promise);
    await driver.heard("What's here?");
    assert.equal(driver.talk(), 'asking');
    assert.equal(driver.context().cameraOn, true);
    assert.equal(driver.asked[0]?.question, "what's here?");
    assert.equal(driver.asked[0]?.wanted, null);
    reply.resolve({ answer: 'On this shelf I see white rice and honey.', offer: null, unreadable: [] });
    await driver.flush();
    assert.equal(driver.spoken[driver.spoken.length - 1], 'On this shelf I see white rice and honey.');
    assert.equal(driver.context().cameraOn, false);
  } finally {
    driver.stop();
  }
});

test('an answer naming a product offers it; yes starts the find for it', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => (input.transcript === 'Yes' ? answer({ intent: 'confirm_yes' }) : WHAT));
    driver.setAsk(() => ({ answer: 'Yes, honey jars on the lower shelf.', offer: 'Medina honey', unreadable: [] }));
    await driver.heard('Is there honey?');
    assert.equal(driver.spoken[driver.spoken.length - 1], 'Yes, honey jars on the lower shelf. Do you want me to take you to it?');
    assert.equal(driver.context().step, 'viewOffer');
    await driver.heard('Yes');
    assert.equal(driver.context().request, 'Medina honey');
    assert.equal(driver.search(), 'active');
    assert.equal(driver.spoken[driver.spoken.length - 1], 'Looking for Medina honey.');
  } finally {
    driver.stop();
  }
});

test('no to the offer leaves the search as it was', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => (input.transcript === 'No' ? answer({ intent: 'confirm_no' }) : WHAT));
    driver.setAsk(() => ({ answer: 'Yes, honey on the lower shelf.', offer: 'Medina honey', unreadable: [] }));
    await driver.heard('Is there honey?');
    await driver.heard('No');
    assert.equal(driver.context().request, null);
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.search(), 'idle');
    assert.equal(driver.spoken[driver.spoken.length - 1], 'All right.');
  } finally {
    driver.stop();
  }
});

test('with no picture of the shelf the shopper is told to point the phone', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => WHAT);
    driver.setAsk(() => {
      throw new NoStillError('no still');
    });
    await driver.heard("What's here?");
    assert.equal(driver.spoken[driver.spoken.length - 1], "I can't see the shelf. Point the phone at it and ask me again.");
    assert.equal(driver.talk(), 'listening');
  } finally {
    driver.stop();
  }
});

test('an answer that never comes is given up after 15 s, aloud', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => WHAT);
    driver.setAsk(() => new Promise(() => undefined));
    await driver.heard("What's here?");
    assert.equal(driver.talk(), 'asking');
    await driver.advance(15000);
    assert.equal(driver.spoken[driver.spoken.length - 1], "I couldn't answer in time. Ask me again.");
    assert.equal(driver.context().cameraOn, false);
  } finally {
    driver.stop();
  }
});

test('a follow-up carries the last exchange, and "shorter" makes answers brief', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => (input.transcript === 'Shorter' ? answer({ intent: 'shorter' }) : answer({ intent: 'ask_view', question: input.transcript })));
    driver.setAsk((input) => ({ answer: input.question === 'Which is cheaper?' ? 'The white rice is 220 dinars.' : 'On this shelf I see white rice and basmati.', offer: null, unreadable: [] }));
    await driver.heard("What's here?");
    await driver.heard('Shorter');
    await driver.heard('Which is cheaper?');
    const second = driver.asked[1];
    assert.deepEqual(second?.hints.history, [{ shopper: "What's here?", ittro: 'On this shelf I see white rice and basmati.' }]);
    assert.equal(second?.hints.brief, true);
  } finally {
    driver.stop();
  }
});

test('a question gets a spoken acknowledgement as it ends, a request does not', async () => {
  resetStorage();
  resetSpeech();
  forgetAck();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => (input.transcript === 'Guedila water' ? answer({ intent: 'request_product', product_text: 'Guedila water' }) : WHAT));
    await driver.heard('Guedila water');
    assert.ok(!speechCalls.some((call: { text: string }) => /Let me|One moment/.test(call.text)));
    await driver.heard("What's here?");
    assert.ok(speechCalls.some((call: { text: string }) => /^(Let me look|One moment|Let me see)…$/.test(call.text)));
  } finally {
    driver.stop();
  }
});
