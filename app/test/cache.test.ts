// The understanding cache: exact repeats and context-free answers
// reuse the model's own past answers instead of asking the relay
// again. Each test uses its own sentences because the cache lives
// for the whole file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor } from 'xstate';
import { understandAnswer } from '../src/conversation/actors';
import type { UnderstandInput } from '../src/conversation/types';
import type { UnderstandAnswer } from '../src/relay';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';

function stubFetch(script: (body: Record<string, unknown>) => UnderstandAnswer): {
  calls: number;
  restore: () => void;
} {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    calls += 1;
    const body = JSON.parse(init.body) as Record<string, unknown>;
    return { ok: true, json: async () => ({ ok: true, answer: script(body) }) };
  }) as typeof fetch;
  return {
    get calls() {
      return calls;
    },
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

function ask(input: UnderstandInput): Promise<UnderstandAnswer> {
  return new Promise((resolve, reject) => {
    const actor = createActor(understandAnswer, { input });
    actor.subscribe((snapshot) => {
      if (snapshot.status === 'done') {
        resolve(snapshot.output);
      } else if (snapshot.status === 'error') {
        reject(snapshot.error);
      }
    });
    actor.start();
  });
}

function inputFor(transcript: string, pendingRequest: string | null): UnderstandInput {
  return {
    transcript,
    lang: 'en',
    step: 'confirm',
    pendingQuestion: 'confirm_request',
    pendingRequest,
    lastLine: 'You asked for something. Is that right? Say yes or no.',
  };
}

test('an exact repeat asks the relay once', async () => {
  const fetch = stubFetch(() => answer({ intent: 'confirm_yes' }));
  try {
    const input = inputFor('Yes indeed', 'Masaad water');
    await ask(input);
    await ask(input);
    assert.equal(fetch.calls, 1);
  } finally {
    fetch.restore();
  }
});

test('a bare yes hits across different pending requests', async () => {
  const fetch = stubFetch(() => answer({ intent: 'confirm_yes' }));
  try {
    await ask(inputFor('Yes please', 'Masaad water'));
    const repeated = await ask(inputFor('Yes please', 'Elio oil'));
    assert.equal(fetch.calls, 1);
    assert.equal(repeated.intent, 'confirm_yes');
  } finally {
    fetch.restore();
  }
});

test('an answer with a product never serves another request', async () => {
  const fetch = stubFetch((body) =>
    answer({ intent: 'confirm_no', product_text: `${body['pending_request']}, the big one` }),
  );
  try {
    const first = await ask(inputFor('The big one please', 'Masaad water'));
    const second = await ask(inputFor('The big one please', 'Elio oil'));
    assert.equal(fetch.calls, 2);
    assert.equal(first.product_text, 'Masaad water, the big one');
    assert.equal(second.product_text, 'Elio oil, the big one');
  } finally {
    fetch.restore();
  }
});

test('a second yes in the conversation needs no new call', async () => {
  resetStorage();
  const fetch = stubFetch((body) => {
    const transcript = String(body['transcript'] ?? '');
    if (transcript.includes('Masaad') || transcript.includes('Elio')) {
      const product = transcript.includes('Masaad') ? 'Masaad water' : 'Elio oil';
      return answer({ intent: 'request_product', product_text: product });
    }
    if (transcript.includes('another')) {
      return answer({ intent: 'find_another' });
    }
    return answer({ intent: 'confirm_yes' });
  });
  try {
    const driver = await startListening({ understandLogic: understandAnswer });
    try {
      await driver.heard("I'm looking for Masaad water");
      await driver.heard('Yes');
      await driver.heard('find another');
      await driver.heard("I'm looking for Elio oil");
      await driver.heard('Yes');
      assert.equal(driver.context().request, 'Elio oil');
      assert.equal(fetch.calls, 4);
    } finally {
      driver.stop();
    }
  } finally {
    fetch.restore();
  }
});

test('two understandings of the same sentence in flight share one relay call', async () => {
  resetStorage();
  const fetched = stubFetch(() => answer({ intent: 'confirm_yes' }));
  try {
    const input = inputFor('Yes that is the one in flight', 'Masaad water');
    const [first, second] = await Promise.all([ask(input), ask(input)]);
    assert.equal(fetched.calls, 1);
    assert.equal(first.intent, 'confirm_yes');
    assert.equal(second.intent, 'confirm_yes');
  } finally {
    fetched.restore();
  }
});
