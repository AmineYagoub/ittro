// Walks asking a person on the real statechart: pairing by voice,
// the send confirmation, waiting with its clock, and answers said
// like Ittro's own. The photo leaves only after "yes".
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { Driver } from './driver';
import { resetStorage } from './stubs.mjs';

async function paired(): Promise<Driver> {
  resetStorage();
  const driver = await startListening({ request: 'Masaad water' });
  driver.setUnderstand(() => answer({ intent: 'add_helper', helper_name: 'Sara' }));
  await driver.heard('Add a helper');
  driver.send({ type: 'HELPER_JOINED', name: 'Sara', token: 'tok1' });
  await driver.flush();
  assert.deepEqual(driver.context().helpers, [{ name: 'Sara', token: 'tok1' }]);
  return driver;
}

async function waiting(): Promise<Driver> {
  const driver = await paired();
  driver.setUnderstand((input) =>
    input.transcript.toLowerCase().includes('ask') ? answer({ intent: 'ask_someone' }) : answer({ intent: 'confirm_yes' }),
  );
  await driver.heard('Ask someone');
  await driver.heard('Yes');
  assert.equal(driver.helper(), 'waiting');
  return driver;
}

test('pairing speaks the code and the join lands', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'add_helper', helper_name: 'Sara' }));
    await driver.heard('Add a helper');
    assert.equal(driver.helper(), 'pairing');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Ask Sara to open .*\/help and type 4 8 2 7 1 5/);
    driver.send({ type: 'HELPER_JOINED', name: 'Sara', token: 'tok1' });
    await driver.flush();
    assert.equal(driver.helper(), 'idle');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Sara is now your helper/);
  } finally {
    driver.stop();
  }
});

test('pairing asks for a name when none was said', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Sara') ? answer({ intent: 'request_product', product_text: 'Sara' }) : answer({ intent: 'add_helper' }),
    );
    await driver.heard('Add a helper');
    assert.equal(driver.context().step, 'helperName');
    await driver.heard('Sara');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Ask Sara to open/);
  } finally {
    driver.stop();
  }
});

test('an expired code says so and idles', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'add_helper', helper_name: 'Sara' }));
    await driver.heard('Add a helper');
    driver.send({ type: 'HELPER_PAIR_EXPIRED' });
    await driver.flush();
    assert.equal(driver.helper(), 'idle');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /code expired/);
  } finally {
    driver.stop();
  }
});

test('asking needs a helper and something to ask about', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'ask_someone' }));
    await driver.heard('Ask someone');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /nothing to ask about/);
  } finally {
    driver.stop();
  }
  resetStorage();
  const named = await startListening({ request: 'Masaad water' });
  try {
    named.setUnderstand(() => answer({ intent: 'ask_someone' }));
    await named.heard('Ask someone');
    assert.match(named.spoken[named.spoken.length - 1] ?? '', /no helper yet/);
    named.setUnderstand(() => answer({ intent: 'ask_someone', helper_name: 'Omar' }));
    await named.heard('Ask Omar');
    assert.match(named.spoken[named.spoken.length - 1] ?? '', /Omar isn't a helper yet/);
  } finally {
    named.stop();
  }
});

test('the photo is sent only after yes, never on no', async () => {
  const driver = await paired();
  try {
    const sends: unknown[] = [];
    driver.setHelper({ send: (input) => {
      sends.push(input);
      return { id: 'q1', helpers: ['Sara'], photo: null };
    } });
    driver.setUnderstand((input) =>
      input.transcript.toLowerCase().includes('ask')
        ? answer({ intent: 'ask_someone', helper_name: 'Sara' })
        : answer({ intent: 'confirm_no' }),
    );
    await driver.heard('Ask Sara');
    assert.equal(driver.context().step, 'helperSend');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /I'll send this picture and your question to Sara/);
    assert.equal(sends.length, 0);
    await driver.heard('No');
    assert.equal(sends.length, 0);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /won't send/);
  } finally {
    driver.stop();
  }
});

test('yes sends to all helpers and starts waiting', async () => {
  const driver = await paired();
  try {
    const sends: Array<{ tokens: string[]; question: string; request: string }> = [];
    driver.setHelper({ send: (input) => {
      sends.push({ tokens: input.tokens, question: input.question, request: input.request });
      return { id: 'q9', helpers: ['Sara'], photo: null };
    } });
    driver.setUnderstand((input) =>
      input.transcript.toLowerCase().includes('ask') ? answer({ intent: 'ask_someone' }) : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard('Ask someone');
    await driver.heard('Yes');
    assert.equal(sends.length, 1);
    assert.deepEqual(sends[0].tokens, ['tok1']);
    assert.equal(sends[0].question, 'is this Masaad water');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Sent to Sara.*Say cancel to stop waiting/);
    assert.equal(driver.helper(), 'waiting');
    assert.equal(driver.context().waiting?.id, 'q9');
  } finally {
    driver.stop();
  }
});

test('waiting nudges every thirty seconds, then gives up at five minutes', async () => {
  const driver = await waiting();
  try {
    const from = driver.spoken.length;
    await driver.advance(10000);
    assert.equal(driver.helper(), 'waitingLate');
    for (let nudge = 0; nudge < 9; nudge += 1) {
      await driver.advance(30000);
    }
    assert.equal(driver.helper(), 'waitingLate');
    await driver.advance(30000);
    assert.equal(driver.helper(), 'idle');
    const fresh = driver.spoken.slice(from).join('\n');
    assert.equal(fresh.split('Still waiting for Sara.').length - 1, 9);
    assert.match(fresh, /Sara hasn't answered\. Say ask again, or read again/);
  } finally {
    driver.stop();
  }
});

test('a yes answer is said, shown and felt like our own', async () => {
  const driver = await waiting();
  try {
    driver.send({ type: 'HELPER_ANSWER', verdict: 'yes', note: "it's the big one", helper: 'Sara' });
    await driver.flush();
    assert.equal(driver.helper(), 'answered');
    assert.equal(driver.context().helperVerdict, 'yes');
    assert.equal(driver.context().helperLabel, 'Sara: Masaad water');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Sara says yes: this is Masaad water\. Their note: it's the big one/);
    assert.deepEqual(driver.context().lastChips, ['find another', 'done']);
  } finally {
    driver.stop();
  }
});

test('no and cannot-tell answers say the next words', async () => {
  const driver = await waiting();
  try {
    driver.send({ type: 'HELPER_ANSWER', verdict: 'no', note: null, helper: 'Sara' });
    await driver.flush();
    assert.equal(driver.context().helperVerdict, null);
    assert.equal(driver.search(), 'active');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Sara says no: this is not Masaad water\. I'll look for it on the shelf/);
  } finally {
    driver.stop();
  }
  const second = await waiting();
  try {
    second.send({ type: 'HELPER_ANSWER', verdict: 'cant_tell', note: 'too dark', helper: 'Sara' });
    await second.flush();
    assert.equal(second.context().helperVerdict, 'unsure');
    assert.match(second.spoken[second.spoken.length - 1] ?? '', /Sara can't tell from the picture\. Their note: too dark/);
  } finally {
    second.stop();
  }
});

test('cancel stops waiting, pairing, or says there is nothing to stop', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
  try {
    const driver = await waiting();
    try {
      driver.setUnderstand(() => answer({ intent: 'cancel' }));
      await driver.heard('Cancel');
      assert.equal(driver.helper(), 'idle');
      assert.equal(driver.context().waiting, null);
      assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /stopped waiting for Sara/);
    } finally {
      driver.stop();
    }
    resetStorage();
    const pairing = await startListening();
    try {
      pairing.setUnderstand((input) =>
        input.transcript.toLowerCase().includes('cancel') ? answer({ intent: 'cancel' }) : answer({ intent: 'add_helper', helper_name: 'Sara' }),
      );
      await pairing.heard('Add a helper');
      await pairing.heard('Cancel');
      assert.equal(pairing.helper(), 'idle');
      assert.match(pairing.spoken[pairing.spoken.length - 1] ?? '', /cancelled adding Sara/);
    } finally {
      pairing.stop();
    }
    resetStorage();
    const idle = await startListening();
    try {
      idle.setUnderstand(() => answer({ intent: 'cancel' }));
      await idle.heard('Cancel');
      assert.match(idle.spoken[idle.spoken.length - 1] ?? '', /nothing to cancel/);
    } finally {
      idle.stop();
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});
