// Live hand frames into fixes and stats: recorded event sequences
// map to photo pixels and the summary math behind the phone log.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { HandFrame } from 'ittro-sensors';
import { createFrameStats, handFixFromEvent } from '../src/guide/frames';

function frame(patch: Partial<HandFrame>): HandFrame {
  return {
    present: true,
    x: 0.25,
    y: 0.5,
    confidence: 0.8,
    handWidth: 0.1,
    detectMs: 120,
    frameMs: 150,
    frame: 1,
    dropped: 0,
    ...patch,
  };
}

test('a present frame maps to photo pixels', () => {
  assert.deepEqual(handFixFromEvent(frame({ x: 0.25, y: 0.5, handWidth: 0.1 }), 1280, 960, 7000), {
    x: 320,
    y: 480,
    confidence: 0.8,
    handWidth: 128,
    atMs: 7000,
  });
});

test('an absent frame or a missing photo maps to no fix', () => {
  assert.equal(handFixFromEvent(frame({ present: false }), 1280, 960, 7000), null);
  assert.equal(handFixFromEvent(frame({}), 0, 960, 7000), null);
});

test('recorded frames summarize rate, detection and drops', () => {
  let now = 10000;
  const stats = createFrameStats(() => now);
  for (let at = 0; at < 40; at += 1) {
    stats.noteFrame(frame({ frame: at + 1, detectMs: 100 + at, dropped: at >= 20 ? 2 : 0 }));
    now += 125;
  }
  const summary = stats.snapshot();
  assert.equal(summary.handsPerSecond, 8);
  assert.equal(summary.detectP50, 120);
  assert.equal(summary.detectP95, 138);
  assert.equal(summary.dropped, 2);
  assert.equal(stats.frames(), 40);
});

test('absent frames count toward the rate but not the detection cost', () => {
  let now = 10000;
  const stats = createFrameStats(() => now);
  for (let at = 0; at < 10; at += 1) {
    stats.noteFrame(frame({ frame: at + 1, present: at % 2 === 0, detectMs: 100 }));
    now += 100;
  }
  const summary = stats.snapshot();
  assert.equal(summary.handsPerSecond, 10);
  assert.equal(summary.detectP50, 100);
});

test('cues measure from the latest frame arrival', () => {
  let now = 10000;
  const stats = createFrameStats(() => now);
  stats.noteCue();
  assert.equal(stats.snapshot().cueP50, 0);
  stats.noteFrame(frame({ frame: 1 }));
  now += 60;
  stats.noteCue();
  now += 140;
  stats.noteFrame(frame({ frame: 2 }));
  now += 40;
  stats.noteCue();
  assert.equal(stats.snapshot().cueP50, 60);
});

test('reset starts the next window clean', () => {
  let now = 10000;
  const stats = createFrameStats(() => now);
  stats.noteFrame(frame({ frame: 1, dropped: 5 }));
  stats.reset();
  now += 1000;
  stats.noteFrame(frame({ frame: 2, dropped: 7 }));
  const summary = stats.snapshot();
  assert.equal(stats.frames(), 1);
  assert.equal(summary.dropped, 0);
  assert.equal(summary.handsPerSecond, 1);
});
