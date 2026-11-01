// Walks the shelf screens: turning the phone, the wrong shelf, the
// not-here offer, the found line and holding the phone. Each line
// carries the computed names and counts from the design.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';


test('a target out of view turns the phone, naming the product', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    driver.send({ type: 'SHELF_TURN', direction: 'right' });
    await driver.flush();
    assert.match(
      driver.spoken[driver.spoken.length - 1] ?? '',
      /I don't see Masaad water yet\. Turn the phone slowly to your right/,
    );
  } finally {
    driver.stop();
  }
});


test('a wrong shelf points to a person, with yes-no chips absent', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    driver.send({ type: 'WRONG_SHELF', shelf: 'biscuits', product: 'Masaad water' });
    await driver.flush();
    assert.equal(
      driver.spoken[driver.spoken.length - 1],
      "This is the biscuits shelf. Ask someone nearby where Masaad water is, and when you're there, say look again. Or say ask someone.",
    );
    assert.deepEqual(driver.context().lastChips, ['look again', 'ask someone']);
  } finally {
    driver.stop();
  }
});


test('the not-here offer asks, and yes adopts it as the request', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('1.5')) {
        return answer({ intent: 'request_product', product_text: 'Masaad 1.5 litres' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad 1.5 litres");
    await driver.heard('Yes');
    driver.send({ type: 'NOT_HERE', wanted: 'Masaad 1.5 litres', answer: 'No Masaad 1.5 litres on this shelf. I see Masaad 0.5 litres.', offer: 'Masaad 0.5 litres', checked: 6, whole: true });
    await driver.flush();
    assert.equal(driver.context().step, 'alternative');
    assert.equal(
      driver.spoken[driver.spoken.length - 1],
      'I checked the whole shelf. No Masaad 1.5 litres on this shelf. I see Masaad 0.5 litres. Do you want Masaad 0.5 litres?',
    );
    await driver.heard('Yes');
    assert.equal(driver.context().request, 'Masaad 0.5 litres');
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.search(), 'active');
  } finally {
    driver.stop();
  }
});


test('the not-here offer answered no keeps the standing request', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('1.5')) {
        return answer({ intent: 'request_product', product_text: 'Masaad 1.5 litres' });
      }
      if (input.transcript.includes('Yes')) {
        return answer({ intent: 'confirm_yes' });
      }
      return answer({ intent: 'confirm_no' });
    });
    await driver.heard("I'm looking for Masaad 1.5 litres");
    await driver.heard('Yes');
    driver.send({ type: 'NOT_HERE', wanted: 'Masaad 1.5 litres', answer: 'No Masaad 1.5 litres on this shelf.', offer: 'Masaad 0.5 litres', checked: 6, whole: true });
    await driver.flush();
    await driver.heard('No thanks');
    assert.equal(driver.context().request, 'Masaad 1.5 litres');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Still looking for Masaad 1.5 litres/);
  } finally {
    driver.stop();
  }
});


test('a found outline is announced at once with its place', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water, the big bottle' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water, the big bottle");
    await driver.heard('Yes');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Yes\. I'm searching the shelf for Masaad water, the big bottle/);
    driver.send({
      type: 'SHELF_FOUND',
      product: 'Masaad water, the big bottle',
      outline: { id: 1, frame: 1, box: { x1: 0, y1: 0, x2: 10, y2: 10, w: 10, h: 10, confidence: null } },
      matches: 1,
      kind: 'bottles',
      position: 'left',
    });
    await driver.flush();
    assert.equal(driver.context().guideLabel, 'Masaad water');
    assert.deepEqual(driver.parts[0], [{ text: 'I found Masaad water on the left.' }]);
    assert.equal(driver.guide(), 'aiming');
  } finally {
    driver.stop();
  }
});

test('a yes read on the shelf says it is found', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: null, matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /I found Masaad water in the middle/);
  } finally {
    driver.stop();
  }
});


test('a camera off the shelf teaches how to hold the phone', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    driver.send({ type: 'NO_SHELF', floor: true });
    await driver.flush();
    assert.match(
      driver.spoken[driver.spoken.length - 1] ?? '',
      /The camera points at the floor\. Hold the phone at chest height/,
    );
  } finally {
    driver.stop();
  }
});
