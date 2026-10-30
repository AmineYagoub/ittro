import test from 'node:test';
import assert from 'node:assert/strict';
import { effortField, mimeField, textField } from '../src/bodies.ts';

test('reads minimal effort by default, low on request', () => {
  assert.equal(effortField(undefined), 'minimal');
  assert.equal(effortField('minimal'), 'minimal');
  assert.equal(effortField('low'), 'low');
  assert.equal(effortField('bogus'), 'minimal');
});

test('reads text and mime fields strictly', () => {
  assert.equal(textField('water'), 'water');
  assert.equal(textField(''), null);
  assert.equal(textField(3), null);
  assert.equal(mimeField('image/png'), 'image/png');
  assert.equal(mimeField('image/jpeg'), 'image/jpeg');
  assert.equal(mimeField('bogus'), 'image/jpeg');
});
