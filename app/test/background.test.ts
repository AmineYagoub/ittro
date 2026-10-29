// Walks background talk: nearby speech and fragments with no
// request are ignored silently, in every language, without stopping
// the search; a real request afterwards still works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { Driver } from './driver';
import { resetStorage } from './stubs.mjs';

async function startSearching(): Promise<Driver> {
  const driver = await startListening();
  driver.setUnderstand((input) => {
    if (input.transcript.includes('Masaad')) {
      return answer({ intent: 'request_product', product_text: 'Masaad water' });
    }
    return answer({ intent: 'confirm_yes' });
  });
  await driver.heard("I'm looking for Masaad water");
  await driver.heard('Yes');
  return driver;
}

function ignoreIn(language: 'en' | 'ar' | 'fr') {
  return answer({ intent: 'ignore', language_spoken: language });
}

test('Darija talk nearby while searching is ignored silently', async () => {
  resetStorage();
  const driver = await startSearching();
  try {
    assert.equal(driver.context().searching, true);
    driver.setUnderstand(() => ignoreIn('ar'));
    const before = driver.spoken.length;
    await driver.heard('هادو وين نديرو هادو');
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.spoken.length, before);
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.context().lang, 'en');
    assert.equal(driver.context().searching, true);
    assert.equal(driver.context().misses, 0);
  } finally {
    driver.stop();
  }
});

test('background talk in English is ignored silently', async () => {
  resetStorage();
  const driver = await startSearching();
  try {
    driver.setUnderstand(() => ignoreIn('en'));
    const before = driver.spoken.length;
    await driver.heard('where did you put those bags');
    assert.equal(driver.spoken.length, before);
    assert.equal(driver.context().searching, true);
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
});

test('background talk in French is ignored silently', async () => {
  resetStorage();
  const driver = await startSearching();
  try {
    driver.setUnderstand(() => ignoreIn('fr'));
    const before = driver.spoken.length;
    await driver.heard('tu as vu les sacs là-bas');
    assert.equal(driver.spoken.length, before);
    assert.equal(driver.context().searching, true);
    assert.equal(driver.context().lang, 'en');
  } finally {
    driver.stop();
  }
});

test('a fragment with no request is ignored silently', async () => {
  resetStorage();
  const driver = await startSearching();
  try {
    driver.setUnderstand(() => ignoreIn('ar'));
    const before = driver.spoken.length;
    await driver.heard('هادو');
    assert.equal(driver.spoken.length, before);
    assert.equal(driver.context().searching, true);
    assert.equal(driver.context().misses, 0);
  } finally {
    driver.stop();
  }
});

test('a real request after background talk is answered', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Guedila')
        ? answer({ intent: 'request_product', product_text: 'Guedila water' })
        : ignoreIn('ar'),
    );
    const before = driver.spoken.length;
    await driver.heard('هادو وين نديرو هادو');
    assert.equal(driver.spoken.length, before);
    await driver.heard("I'm looking for Guedila water");
    assert.equal(driver.context().step, 'confirm');
    assert.equal(driver.context().pendingRequest, 'Guedila water');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Guedila water\. Is that right/);
  } finally {
    driver.stop();
  }
});

test('background during a confirm leaves the question open', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript === 'Yes') {
        return answer({ intent: 'confirm_yes' });
      }
      return ignoreIn('en');
    });
    await driver.heard("I'm looking for Masaad water");
    assert.equal(driver.context().step, 'confirm');
    const before = driver.spoken.length;
    await driver.heard('which aisle was that');
    assert.equal(driver.spoken.length, before);
    assert.equal(driver.context().step, 'confirm');
    assert.equal(driver.context().pendingRequest, 'Masaad water');
    await driver.heard('Yes');
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
});

test('background in sleep stays asleep silently', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript === 'Stop' ? answer({ intent: 'stop' }) : ignoreIn('fr'),
    );
    await driver.heard('Stop');
    assert.equal(driver.talk(), 'sleeping');
    const before = driver.spoken.length;
    await driver.heard('tu viens ce soir');
    assert.equal(driver.talk(), 'sleeping');
    assert.equal(driver.spoken.length, before);
  } finally {
    driver.stop();
  }
});

test('the silence clock carries on after background talk', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => ignoreIn('en'));
    const silent = driver.spoken.length;
    await driver.heard('which aisle was that');
    assert.equal(driver.spoken.length, silent);
    await driver.advance(8000);
    assert.equal(driver.spoken.length, silent + 1);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /What are you looking for/);
  } finally {
    driver.stop();
  }
});
