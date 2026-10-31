// A missing or stale hand voids the check: without a fresh fix
// the answer is dropped and reread, never spoken as a yes about a
// product the shopper may have swapped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNSURE, YES, fix, flush, scripted } from './confirm-harness';

test('without hand data the answer is void, never a yes', async () => {
  const { script, loop } = scripted();
  script.hand = null;
  loop.begin();
  await flush();
  script.answer(YES);
  await flush();
  assert.deepEqual(script.sent, [{ type: 'CONFIRM_MOVED', epoch: 1 }]);
  loop.stop();
});

test('a hand that disappears before the answer voids it', async () => {
  const { script, loop } = scripted();
  loop.begin();
  await flush();
  script.hand = null;
  script.answer(YES);
  await flush();
  assert.deepEqual(script.sent, [{ type: 'CONFIRM_MOVED', epoch: 1 }]);
  loop.stop();
});

test('a stale hand voids the answer', async () => {
  const { script, loop, advance } = scripted();
  loop.begin();
  await flush();
  script.answer(UNSURE);
  await flush();
  await advance(2500);
  script.hand = fix(100, 100, 0);
  script.answer(YES);
  await flush();
  assert.deepEqual(script.sent.slice(-1), [{ type: 'CONFIRM_MOVED', epoch: 1 }]);
  loop.stop();
});
