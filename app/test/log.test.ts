// Test builds log in release; the store build stays silent. The
// release setting decides, and every timeline line goes through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { logIttro, releaseLogsOn, setLogsOverride } from '../src/log';

test('release logs stay on unless the setting turns them off', () => {
  setLogsOverride(null);
  try {
    assert.equal(releaseLogsOn(null), true);
    assert.equal(releaseLogsOn({}), true);
    assert.equal(releaseLogsOn({ logs: true }), true);
    assert.equal(releaseLogsOn({ logs: false }), false);
  } finally {
    setLogsOverride(null);
  }
});

test('the override decides either way for tests', () => {
  try {
    setLogsOverride(false);
    assert.equal(releaseLogsOn({ logs: true }), false);
    setLogsOverride(true);
    assert.equal(releaseLogsOn({ logs: false }), true);
  } finally {
    setLogsOverride(null);
  }
});

test('logIttro prints the timeline line only when logs are on', () => {
  const printed: string[] = [];
  const realLog = console.log;
  console.log = (...args: unknown[]): void => {
    printed.push(args.map((part) => String(part)).join(' '));
  };
  try {
    setLogsOverride(true);
    logIttro('say: "hi"');
    setLogsOverride(false);
    logIttro('say: "silent"');
  } finally {
    console.log = realLog;
    setLogsOverride(null);
  }
  assert.equal(printed.length, 1);
  assert.match(printed[0] as string, /^\[ittro\] \+\d+\.\d+s say: "hi"$/);
});
