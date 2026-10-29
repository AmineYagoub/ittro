// The helper offer and edges: two unreadable reads offer asking,
// buttons work in helper states, and a new search or stop ends the
// wait and deletes the relay photo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { Driver } from './driver';
import { resetStorage } from './stubs.mjs';
import AsyncStorage from './stubs.mjs';
import type { ConversationEvent } from '../src/conversation/types';

const CROP = 'data:image/jpeg;base64,aGk=';

async function paired(): Promise<Driver> {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  driver.setUnderstand(() => answer({ intent: 'add_helper', helper_name: 'Sara' }));
  await driver.heard('Add a helper');
  driver.send({ type: 'HELPER_JOINED', name: 'Sara', token: 'tok1' });
  await driver.flush();
  return driver;
}

function unsure(epoch: number): ConversationEvent {
  return { type: 'CONFIRM_UNSURE', epoch, label: 'Masaad', crop: CROP, read: ['Masaad'], missing: ['size'] };
}

test('two unreadable reads in a row offer asking, once', async () => {
  const driver = await paired();
  try {
    driver.send({ type: 'CONFIRM_BEGIN' });
    await driver.flush();
    driver.send(unsure(1));
    await driver.flush();
    assert.notEqual(driver.context().step, 'helperOffer');
    driver.send(unsure(1));
    await driver.flush();
    assert.equal(driver.context().step, 'helperOffer');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Do you want to ask Sara\? Say yes or no/);
    const count = driver.spoken.length;
    driver.send(unsure(1));
    await driver.flush();
    assert.equal(driver.spoken.length, count);
  } finally {
    driver.stop();
  }
});

test('the offer needs a helper, and yes names them at the send question', async () => {
  resetStorage();
  const lonely = await startListening({ request: 'Masaad water' });
  try {
    lonely.send({ type: 'CONFIRM_BEGIN' });
    await lonely.flush();
    lonely.send(unsure(1));
    await lonely.flush();
    lonely.send(unsure(1));
    await lonely.flush();
    assert.notEqual(lonely.context().step, 'helperOffer');
  } finally {
    lonely.stop();
  }
  const driver = await paired();
  try {
    driver.setUnderstand(() => answer({ intent: 'confirm_yes' }));
    driver.send({ type: 'CONFIRM_BEGIN' });
    await driver.flush();
    driver.send(unsure(1));
    await driver.flush();
    driver.send(unsure(1));
    await driver.flush();
    await driver.heard('Yes');
    assert.equal(driver.context().step, 'helperSend');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /your question to Sara: is this Masaad water\? Say yes to send/);
  } finally {
    driver.stop();
  }
});

test('no to the offer carries on, and a verdict resets the count', async () => {
  const driver = await paired();
  try {
    driver.setUnderstand(() => answer({ intent: 'confirm_no' }));
    driver.send({ type: 'CONFIRM_BEGIN' });
    await driver.flush();
    driver.send(unsure(1));
    await driver.flush();
    driver.send(unsure(1));
    await driver.flush();
    await driver.heard('No');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /^Okay\.$/);
    driver.send({ type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water', crop: CROP });
    await driver.flush();
    assert.equal(driver.context().unsureStreak, 0);
  } finally {
    driver.stop();
  }
});

test('buttons answer the helper questions like the words', async () => {
  const driver = await paired();
  try {
    driver.setUnderstand((input) =>
      input.transcript.toLowerCase().includes('ask') ? answer({ intent: 'ask_someone', helper_name: 'Sara' }) : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard('Ask Sara');
    driver.send({ type: 'BUTTON_PRESS', gesture: 'single' });
    await driver.flush();
    assert.equal(driver.helper(), 'waiting');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Sent to Sara/);
  } finally {
    driver.stop();
  }
  const second = await paired();
  try {
    second.setUnderstand(() => answer({ intent: 'ask_someone', helper_name: 'Sara' }));
    await second.heard('Ask Sara');
    second.send({ type: 'BUTTON_PRESS', gesture: 'double' });
    await second.flush();
    assert.match(second.spoken[second.spoken.length - 1] ?? '', /won't send/);
    assert.equal(second.helper(), 'idle');
  } finally {
    second.stop();
  }
});

test('a new search ends waiting and deletes the relay photo', async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: unknown) => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ ok: true }) };
  }) as unknown as typeof fetch;
  try {
    const driver = await paired();
    try {
      driver.setUnderstand((input) => {
        if (input.transcript.toLowerCase().includes('ask')) {
          return answer({ intent: 'ask_someone' });
        }
        if (input.transcript.includes('Yes')) {
          return answer({ intent: 'confirm_yes' });
        }
        return answer({ intent: 'request_product', product_text: 'Elio oil' });
      });
      await driver.heard('Ask someone');
      await driver.heard('Yes');
      assert.equal(driver.helper(), 'waiting');
      await driver.heard('Find Elio oil');
      assert.equal(driver.helper(), 'idle');
      assert.equal(driver.context().waiting, null);
      assert.ok(calls.some((url) => url.endsWith('/helper-cancel')));
    } finally {
      driver.stop();
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('pairing and sending failures say so instead of hanging', async () => {
  resetStorage();
  const pairing = await startListening();
  try {
    pairing.setHelper({ pair: () => Promise.reject(new Error('offline')) });
    pairing.setUnderstand(() => answer({ intent: 'add_helper', helper_name: 'Sara' }));
    await pairing.heard('Add a helper');
    assert.match(pairing.spoken[pairing.spoken.length - 1] ?? '', /couldn't make a code/);
    assert.equal(pairing.helper(), 'idle');
  } finally {
    pairing.stop();
  }
  const driver = await paired();
  try {
    driver.setHelper({ send: () => Promise.reject(new Error('offline')) });
    driver.setUnderstand((input) =>
      input.transcript.toLowerCase().includes('ask') ? answer({ intent: 'ask_someone' }) : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard('Ask someone');
    await driver.heard('Yes');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /couldn't send that/);
    assert.equal(driver.helper(), 'idle');
  } finally {
    driver.stop();
  }
});

test('helpers are remembered between launches', async () => {
  const driver = await paired();
  try {
    await driver.flush();
    const raw = await AsyncStorage.getItem('ittro.prefs.v1');
    assert.ok(raw?.includes('tok1'));
  } finally {
    driver.stop();
  }
});

test('a pause keeps the wait and the pairing, answered late is never spoken', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
  try {
    const driver = await paired();
    try {
      driver.setUnderstand((input) => {
        if (input.transcript.toLowerCase().includes('ask')) {
          return answer({ intent: 'ask_someone' });
        }
        if (input.transcript.includes('Yes')) {
          return answer({ intent: 'confirm_yes' });
        }
        return answer({ intent: 'cancel' });
      });
      await driver.heard('Ask someone');
      await driver.heard('Yes');
      driver.send({ type: 'PAUSE' });
      await driver.flush();
      driver.send({ type: 'RESUME' });
      await driver.flush();
      assert.equal(driver.helper(), 'waiting');
      driver.send({ type: 'HELPER_ANSWER', verdict: 'yes', note: null, helper: 'Sara' });
      await driver.flush();
      assert.equal(driver.helper(), 'answered');
      await driver.heard('Cancel');
      const count = driver.spoken.length;
      driver.send({ type: 'HELPER_ANSWER', verdict: 'no', note: null, helper: 'Sara' });
      await driver.flush();
      assert.equal(driver.spoken.length, count);
      assert.equal(driver.context().helperVerdict, 'yes');
    } finally {
      driver.stop();
    }
    resetStorage();
    const pairing = await startListening();
    try {
      pairing.setUnderstand(() => answer({ intent: 'add_helper', helper_name: 'Sara' }));
      await pairing.heard('Add a helper');
      pairing.send({ type: 'PAUSE' });
      await pairing.flush();
      pairing.send({ type: 'RESUME' });
      await pairing.flush();
      assert.equal(pairing.helper(), 'pairing');
    } finally {
      pairing.stop();
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
