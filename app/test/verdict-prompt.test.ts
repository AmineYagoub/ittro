// Only the yes screen skips asking again 8 s on (t25 heard its
// prompt twice in a row); every other screen still asks again, and
// the help offer still comes everywhere (confirm.test.ts walks it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startListening } from './driver';
import { resetStorage } from './stubs.mjs';
import { repromptDue } from '../src/conversation/actions';

test('only the yes screen skips asking again', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    const base = { ...driver.context(), confirming: false, guiding: false, step: 'verdict' as const };
    assert.equal(repromptDue({ context: { ...base, confirmVerdict: 'yes' } }), false);
    assert.equal(repromptDue({ context: { ...base, confirmVerdict: 'no' } }), true);
    assert.equal(repromptDue({ context: { ...base, step: 'confirm', confirmVerdict: 'yes' } }), true);
  } finally {
    driver.stop();
  }
});
