// Android's version code comes from the app's version
// (docs/contributing/releases.md#versions), so it only ever goes up.
import test from 'node:test';
import assert from 'node:assert/strict';
import config, { versionCode } from '../app.config';

test('a release ends in 99, after its betas', () => {
  assert.equal(versionCode('0.1.0'), 10_099);
  assert.equal(versionCode('1.5.0'), 1_050_099);
  assert.equal(versionCode('1.5.0-beta.1'), 1_050_001);
  assert.ok(versionCode('1.5.0-beta.98') < versionCode('1.5.0'));
  assert.ok(versionCode('1.5.0') < versionCode('1.5.1-beta.1'));
});

test('versions it cannot number are refused', () => {
  assert.throws(() => versionCode('1.100.0'));
  assert.throws(() => versionCode('1.0.100'));
  assert.throws(() => versionCode('1.0.0-beta.99'));
  assert.throws(() => versionCode('1.0'));
});

test('the build carries the version and its code', () => {
  assert.equal(config.android?.versionCode, versionCode(config.version ?? ''));
});
