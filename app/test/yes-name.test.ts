// The yes names the product the way Ittro has been calling it: t13
// said "هذا قديلة ماء" from the read's word order after searching for
// "ماء قديلة". A size the read adds is kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { yesName } from '../src/confirm/verdicts';

test('the read word order gives way to the request (t13)', () => {
  assert.equal(yesName('قديلة ماء', 'ماء قديلة'), 'ماء قديلة');
  assert.equal(yesName('مسعد ماء', 'ماء مسعد'), 'ماء مسعد');
});

test('a size the read adds is kept', () => {
  assert.equal(yesName('Masaad water, 1.5 litres', 'Masaad water'), 'Masaad water, 1.5 litres');
  assert.equal(yesName('مسعد ماء، 1.5 لتر', 'ماء مسعد'), 'ماء مسعد، 1.5 لتر');
});

test('with no request the read label stands', () => {
  assert.equal(yesName('Masaad water', null), 'Masaad water');
});
