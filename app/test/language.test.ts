// Walks switching languages both ways and the offer when the
// shopper speaks another language unasked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';

test('switches to Arabic and back on command', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Arabic')
        ? answer({ intent: 'speak_language', target_language: 'ar' })
        : answer({ intent: 'speak_language', target_language: 'en' }),
    );
    await driver.heard('Speak Arabic');
    assert.equal(driver.context().lang, 'ar');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /العربية/);
    await driver.heard('English');
    assert.equal(driver.context().lang, 'en');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /speak English now/);
  } finally {
    driver.stop();
  }
});

test('confirms an Arabic request in Arabic', async () => {
  resetStorage();
  const driver = await startListening({ language: 'ar' });
  try {
    driver.setUnderstand(() =>
      answer({ intent: 'request_product', language_spoken: 'ar', product_text: 'ماء مسعد' }),
    );
    await driver.heard('أريد ماء مسعد');
    assert.equal(driver.context().step, 'confirm');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /هل هذا صحيح/);
  } finally {
    driver.stop();
  }
});

test('a confirmed request is said in the new language after a switch', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.step === 'translate') {
        return answer({ intent: 'request_product', language_spoken: 'ar', product_text: 'ماء مسعد' });
      }
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.includes('Yes')) {
        return answer({ intent: 'confirm_yes' });
      }
      return answer({ intent: 'speak_language', target_language: 'ar' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    await driver.heard('Speak Arabic');
    assert.equal(driver.context().lang, 'ar');
    assert.equal(driver.context().request, 'ماء مسعد');
    assert.equal(driver.context().requestLang, 'ar');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /العربية/);
  } finally {
    driver.stop();
  }
});

test('a pending request is translated with the confirm left open', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.step === 'translate') {
        return answer({ intent: 'request_product', language_spoken: 'ar', product_text: 'ماء مسعد' });
      }
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'speak_language', target_language: 'ar' });
    });
    await driver.heard("I'm looking for Masaad water");
    assert.equal(driver.context().step, 'confirm');
    await driver.heard('Speak Arabic');
    assert.equal(driver.context().lang, 'ar');
    assert.equal(driver.context().step, 'confirm');
    assert.equal(driver.context().pendingRequest, 'ماء مسعد');
    assert.equal(driver.context().pendingQuestion, 'confirm_request');
  } finally {
    driver.stop();
  }
});

test('the switch still lands when translation fails', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.step === 'translate') {
        throw new Error('relay down');
      }
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.includes('Yes')) {
        return answer({ intent: 'confirm_yes' });
      }
      return answer({ intent: 'speak_language', target_language: 'ar' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    await driver.heard('Speak Arabic');
    assert.equal(driver.context().lang, 'ar');
    assert.equal(driver.context().request, 'Masaad water');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /العربية/);
  } finally {
    driver.stop();
  }
});

test('offers the new language, then carries on with yes', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript === 'نعم'
        ? answer({ intent: 'confirm_yes', language_spoken: 'ar' })
        : answer({ intent: 'request_product', language_spoken: 'ar', product_text: 'ماء مسعد' }),
    );
    await driver.heard('أريد ماء مسعد');
    assert.equal(driver.context().step, 'offer');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /أتكلم بالعربية/);
    await driver.heard('نعم');
    assert.equal(driver.context().lang, 'ar');
    assert.equal(driver.context().step, 'confirm');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /هل هذا صحيح/);
  } finally {
    driver.stop();
  }
});

test('keeps the language and the request on no to the offer', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript === 'لا'
        ? answer({ intent: 'confirm_no', language_spoken: 'ar' })
        : answer({ intent: 'request_product', language_spoken: 'ar', product_text: 'ماء مسعد' }),
    );
    await driver.heard('أريد ماء مسعد');
    await driver.heard('لا');
    assert.equal(driver.context().lang, 'en');
    assert.equal(driver.context().step, 'confirm');
    assert.match(driver.spoken.join('\n'), /keep speaking English/);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Is that right/);
  } finally {
    driver.stop();
  }
});
