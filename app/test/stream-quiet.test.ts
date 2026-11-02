// A stream that hears nothing is reopened as Ittro starts a line:
// t22's socket stayed open 150 s after its last transcript and
// brought nothing back. Quiet alone never reopens it, since the
// shopper may be about to talk, and a stream that heard something
// lately is kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor } from 'xstate';
import { streamClient } from '../src/conversation/streamActor';
import { QUIET_REOPEN_MS, createQuietWatch } from '../src/conversation/streamQuiet';
import { openVoice } from '../src/voiceGate';
import { emitAudioChunk } from './stubs.mjs';

const CHUNK = Buffer.alloc(3840).toString('base64');

class SocketDouble {
  static OPEN = 1;
  readyState = 1;
  sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { code: number; reason: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  constructor() {
    opened.push(this);
  }
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
}

const opened: SocketDouble[] = [];

function readyStream(): { stop: () => void; first: SocketDouble } {
  opened.length = 0;
  const real = (globalThis as Record<string, unknown>)['WebSocket'];
  (globalThis as Record<string, unknown>)['WebSocket'] = SocketDouble;
  const actor = createActor(streamClient, { input: { url: 'ws://localhost:8787', code: 'test', keywords: [] } });
  actor.start();
  const first = opened[0] as SocketDouble;
  first.onopen?.();
  first.onmessage?.({ data: JSON.stringify({ type: 'ready' }) });
  return {
    first,
    stop: () => {
      actor.stop();
      (globalThis as Record<string, unknown>)['WebSocket'] = real;
    },
  };
}

test('the watch fires once, when Ittro starts a line after the quiet limit', () => {
  let now = 0;
  const watch = createQuietWatch(() => now);
  now = QUIET_REOPEN_MS + 1000;
  assert.equal(watch.due(false), 0, 'quiet alone');
  assert.equal(watch.due(true), QUIET_REOPEN_MS + 1000, 'Ittro starts a line');
  assert.equal(watch.due(true), 0, 'the same line');
  assert.equal(watch.due(false), 0);
  assert.equal(watch.due(true), 0, 'the next line comes before another quiet limit');
});

test('anything heard holds the watch off', () => {
  let now = 0;
  const watch = createQuietWatch(() => now);
  now = QUIET_REOPEN_MS - 5000;
  watch.heard();
  now = QUIET_REOPEN_MS + 5000;
  assert.equal(watch.due(true), 0);
});

test('a stream that heard nothing for 30 s reopens as Ittro starts a line (t22)', () => {
  const realNow = Date.now;
  const base = realNow();
  const stream = readyStream();
  let release: (() => void) | null = null;
  try {
    Date.now = () => base + QUIET_REOPEN_MS + 1000;
    emitAudioChunk(CHUNK, 1);
    assert.equal(opened.length, 1, 'quiet alone reopens nothing');
    release = openVoice();
    emitAudioChunk(CHUNK, 2);
    assert.equal(stream.first.closed, true);
    assert.equal(opened.length, 2);
  } finally {
    Date.now = realNow;
    release?.();
    stream.stop();
  }
});

test('a stream that heard something lately is kept', () => {
  const realNow = Date.now;
  const base = realNow();
  const stream = readyStream();
  let release: (() => void) | null = null;
  try {
    Date.now = () => base + QUIET_REOPEN_MS - 10000;
    stream.first.onmessage?.({ data: JSON.stringify({ kind: 'transcript', transcript: 'ابحث', final: false }) });
    Date.now = () => base + QUIET_REOPEN_MS + 10000;
    release = openVoice();
    emitAudioChunk(CHUNK, 1);
    assert.equal(stream.first.closed, false);
    assert.equal(opened.length, 1);
  } finally {
    Date.now = realNow;
    release?.();
    stream.stop();
  }
});
