// Ittro never answers its own voice, and the shopper can always
// interrupt: own lines are dropped, echo plus more is stripped to
// the rest, and speech in any saying state stops Ittro and routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { transcriptFate } from '../src/conversation/echo';
import { confirmRequest } from '../src/requestLines';
import { welcome } from '../src/lines';
import { pictureLine } from '../src/confirm/lines';
import { resetSpeech, speechStops } from './stubs.mjs';

const NO_LINE = 'No. This is Guedila bottle. Put it back. Say guide me, or read again.';

test('a full echo of the last line is dropped', () => {
  assert.deepEqual(transcriptFate('Almost there.', ['Almost there.']), { echo: true });
});

test('an echo fragment covering half the line is dropped', () => {
  assert.deepEqual(transcriptFate('almost', ['Almost there.']), { echo: true });
  assert.deepEqual(transcriptFate("I can't confirm", ["I can't confirm yet."]), { echo: true });
});

test('an echo with more after it is stripped to the rest', () => {
  const picture = pictureLine('blurry', 'en');
  const fate = transcriptFate(`${picture} Guide me.`, [picture]);
  assert.deepEqual(fate, { echo: false, text: 'Guide me', stripped: true });
});

test('a short answer inside a long line is the shopper', () => {
  assert.deepEqual(transcriptFate('Guide me', [NO_LINE]), { echo: false, text: 'Guide me', stripped: false });
  assert.deepEqual(transcriptFate('yes', ['You asked for Masaad water. Is that right? Say yes or no.']), {
    echo: false,
    text: 'yes',
    stripped: false,
  });
});

test('a similar but different sentence is the shopper', () => {
  assert.deepEqual(transcriptFate('Is this the right', ['Is that right? Say yes or no.']), {
    echo: false,
    text: 'Is this the right',
    stripped: false,
  });
});

test('a decimal point is not a sentence break', () => {
  const fate = transcriptFate("I'm looking for Masaad 1.5 litres", [welcome.en]);
  assert.equal(fate.echo, false);
  if (fate.echo === false) {
    assert.equal(fate.stripped, false);
  }
});

test("Ittro does not understand its own line", async () => {
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand(() => {
      calls += 1;
      return answer({ intent: 'ignore' });
    });
    await driver.heard(welcome.en);
    assert.equal(calls, 0);
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.spoken.length, 1);
  } finally {
    driver.stop();
  }
});

test('an echo fragment never reaches understanding', async () => {
  const driver = await startListening();
  try {
    let calls = 0;
    driver.setUnderstand(() => {
      calls += 1;
      return answer({ intent: 'ignore' });
    });
    await driver.partial("Tell me what you're looking for");
    assert.equal(calls, 0);
    assert.equal(driver.talk(), 'listening');
  } finally {
    driver.stop();
  }
});

test('an echo with an answer after it routes the answer', async () => {
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript === 'Masaad water') {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard('Masaad water');
    const question = confirmRequest('Masaad water', 'en');
    assert.equal(driver.spoken.at(-1), question);
    await driver.heard(`${question} Yes`);
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
});

test('the shopper interrupts speech and is heard', async () => {
  resetSpeech();
  const driver = await startListening();
  try {
    driver.holdSpeech(true);
    await driver.heard('Masaad water');
    assert.equal(driver.talk(), 'saying');
    let heard: string | null = null;
    driver.setUnderstand((input) => {
      heard = input.transcript;
      return answer({ intent: 'stop' });
    });
    driver.send({ type: 'FINAL_TEXT', text: 'stop' });
    await driver.flush();
    assert.equal(heard, 'stop');
    assert.ok(speechStops.length > 0);
    driver.holdSpeech(false);
    await driver.flush();
    assert.equal(driver.talk(), 'sleeping');
  } finally {
    driver.stop();
    resetSpeech();
  }
});

test('a partial while speaking starts understanding early', async () => {
  resetSpeech();
  const driver = await startListening();
  try {
    driver.holdSpeech(true);
    await driver.heard('Masaad water');
    assert.equal(driver.talk(), 'saying');
    driver.setUnderstand(() => answer({ intent: 'stop' }));
    await driver.partial('stop it');
    assert.equal(driver.talk(), 'speculating');
    assert.ok(speechStops.length > 0);
    driver.holdSpeech(false);
  } finally {
    driver.stop();
    resetSpeech();
  }
});

test('an echo while speaking neither stops nor routes', async () => {
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
    await driver.partial('You asked for Masaad water');
    assert.equal(driver.talk(), 'saying');
    assert.equal(calls, 0);
    assert.equal(speechStops.length, 0);
    driver.holdSpeech(false);
  } finally {
    driver.stop();
    resetSpeech();
  }
});
