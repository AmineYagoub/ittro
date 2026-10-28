// Walks the request path: boot, ask, confirm, yes. Every step asserts
// the statechart's state and the exact lines it would speak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import { resetStorage } from './stubs.mjs';

test('boots past the welcome into listening', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    assert.equal(driver.talk(), 'listening');
    assert.match(driver.spoken[0] ?? '', /looking for/);
    assert.equal(driver.context().step, 'welcome');
  } finally {
    driver.stop();
  }
});

test('requests, confirms and keeps the product on yes', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_yes' }),
    );
    await driver.heard("I'm looking for Masaad water");
    assert.equal(driver.talk(), 'listening');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Masaad water\. Is that right/);
    assert.equal(driver.context().step, 'confirm');
    await driver.heard('Yes');
    assert.equal(driver.context().request, 'Masaad water');
    assert.equal(driver.context().step, 'welcome');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Searching the shelf/);
  } finally {
    driver.stop();
  }
});

test('corrects a confirmed request with the combined detail', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.includes('big one')) {
        return answer({ intent: 'confirm_no', product_text: 'Masaad water, the big one' });
      }
      return answer({ intent: 'confirm_yes' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    await driver.heard('No, the big one');
    assert.equal(driver.context().step, 'confirm');
    assert.equal(driver.context().pendingRequest, 'Masaad water, the big one');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /the big one\. Is that right/);
  } finally {
    driver.stop();
  }
});

test('declining a re-confirm keeps the confirmed request', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.includes('big one')) {
        return answer({ intent: 'confirm_no', product_text: 'Masaad water, the big one' });
      }
      if (input.transcript.includes('Yes')) {
        return answer({ intent: 'confirm_yes' });
      }
      return answer({ intent: 'confirm_no' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    await driver.heard('No, the big one');
    await driver.heard('No thanks');
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.context().pendingRequest, null);
    assert.equal(driver.context().request, 'Masaad water');
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Okay, keeping Masaad water/);
  } finally {
    driver.stop();
  }
});

test('declining a first confirm asks what to find', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) =>
      input.transcript.includes('Masaad')
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_no' }),
    );
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('No thanks');
    assert.equal(driver.context().step, 'welcome');
    assert.equal(driver.context().request, null);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Okay\. What are you looking for/);
  } finally {
    driver.stop();
  }
});

test('no thanks with a standing request drops the search', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      if (input.transcript.includes('Yes')) {
        return answer({ intent: 'confirm_yes' });
      }
      return answer({ intent: 'confirm_no' });
    });
    await driver.heard("I'm looking for Masaad water");
    await driver.heard('Yes');
    await driver.heard('No thanks');
    assert.equal(driver.context().request, null);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /Okay\. What are you looking for/);
  } finally {
    driver.stop();
  }
});

test('the camera follows the search: on at confirm, off at no', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand((input) => {
      if (input.transcript.includes('Masaad')) {
        return answer({ intent: 'request_product', product_text: 'Masaad water' });
      }
      return answer({ intent: 'confirm_no' });
    });
    assert.equal(driver.context().cameraOn, false);
    assert.equal(driver.search(), 'idle');
    await driver.heard("I'm looking for Masaad water");
    assert.equal(driver.context().cameraOn, true);
    assert.equal(driver.search(), 'active');
    await driver.heard('No thanks');
    assert.equal(driver.context().cameraOn, false);
    assert.equal(driver.search(), 'idle');
  } finally {
    driver.stop();
  }
});

test('no with nothing standing is not understood', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    driver.setUnderstand(() => answer({ intent: 'confirm_no' }));
    await driver.heard('No');
    assert.equal(driver.context().request, null);
    assert.match(driver.spoken[driver.spoken.length - 1] ?? '', /didn't catch that/);
  } finally {
    driver.stop();
  }
});
