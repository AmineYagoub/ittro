// A clear request starts the search at once, with no "is that right?"
// turn (founder, 31 October): Ittro says "Looking for …" and looks.
// "No" still cancels it, "no, …" still corrects it, and a list of
// several products still asks first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';

test('a clear request is searched at once, with no confirm question', async () => {
  resetStorage();
  const driver = await startListening({ askConfirm: false });
  try {
    driver.setUnderstand(() => answer({ intent: 'request_product', product_text: 'Masaad water' }));
    await driver.heard("I'm looking for Masaad water");
    assert.equal(driver.spoken.at(-1), 'Looking for Masaad water.');
    assert.equal(driver.context().request, 'Masaad water');
    assert.equal(driver.context().pendingRequest, null);
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.context().pendingQuestion, null);
    assert.equal(driver.context().searching, true);
  } finally {
    driver.stop();
  }
});

test('"no, Guedila" after a direct start corrects the search', async () => {
  resetStorage();
  const driver = await startListening({ askConfirm: false });
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Guedila')
        ? answer({ intent: 'confirm_no', product_text: 'Guedila water' })
        : answer({ intent: 'request_product', product_text: 'Masaad water' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('No, Guedila water');
    assert.equal(driver.context().pendingRequest ?? driver.context().request, 'Guedila water');
  } finally {
    driver.stop();
  }
});

test('a plain "no" after a direct start stops the search', async () => {
  resetStorage();
  const driver = await startListening({ askConfirm: false });
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad') ? answer({ intent: 'request_product', product_text: 'Masaad water' }) : answer({ intent: 'confirm_no' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('No');
    assert.equal(driver.context().request, null);
  } finally {
    driver.stop();
  }
});

test('an Arabic request starts in Arabic', async () => {
  resetStorage();
  const driver = await startListening({ askConfirm: false, language: 'ar' });
  try {
    driver.setUnderstand(() => answer({ intent: 'request_product', product_text: 'ماء مسعد', language_spoken: 'ar' }));
    await driver.heard('أبحث عن ماء مسعد');
    assert.equal(driver.spoken.at(-1), 'أبحث عن ماء مسعد.');
  } finally {
    driver.stop();
  }
});
