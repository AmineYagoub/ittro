// A dead relay must not hot-loop the stream: restarts wait 1 s,
// then 2 s, 4 s and so on, a ready stream resets the wait, and a
// clean stop starts fresh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor } from 'xstate';
import { streamClient } from '../src/conversation/streamActor';

interface FakeSocket {
  url: string;
  readyState: number;
  sent: unknown[];
  closed: boolean;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: { code: number; reason: string }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send: (data: unknown) => void;
  close: () => void;
}

const opened: FakeSocket[] = [];

class SocketDouble {
  static OPEN = 1;
  url: string;
  readyState = 1;
  sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { code: number; reason: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    opened.push(this);
  }
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
}

function installSocket(): () => void {
  const real = (globalThis as Record<string, unknown>)['WebSocket'];
  (globalThis as Record<string, unknown>)['WebSocket'] = SocketDouble;
  return () => {
    (globalThis as Record<string, unknown>)['WebSocket'] = real;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOpen(count: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (opened.length < count && Date.now() - started < timeoutMs) {
    await sleep(5);
  }
  assert.equal(opened.length >= count, true);
}

test('restarts back off instead of reopening at once', async () => {
  opened.length = 0;
  const restore = installSocket();
  try {
    const actor = createActor(streamClient, {
      input: { url: 'ws://localhost:8787', code: 'test', keywords: [], retryBaseMs: 30 },
    });
    actor.start();
    await waitForOpen(1, 500);
    opened[0]?.onclose?.({ code: 1006, reason: '' });
    const first = Date.now();
    actor.send({ type: 'START', keywords: [] });
    await sleep(10);
    assert.equal(opened.length, 1);
    await waitForOpen(2, 500);
    const firstWait = Date.now() - first;
    assert.ok(firstWait >= 20, `first retry waited ${firstWait}ms`);
    opened[1]?.onclose?.({ code: 1006, reason: '' });
    const second = Date.now();
    actor.send({ type: 'START', keywords: [] });
    await waitForOpen(3, 1000);
    const secondWait = Date.now() - second;
    assert.ok(secondWait > firstWait, `second retry waited ${secondWait}ms after ${firstWait}ms`);
    actor.stop();
  } finally {
    restore();
  }
});

test('a ready stream resets the wait', async () => {
  opened.length = 0;
  const restore = installSocket();
  try {
    const actor = createActor(streamClient, {
      input: { url: 'ws://localhost:8787', code: 'test', keywords: [], retryBaseMs: 30 },
    });
    actor.start();
    await waitForOpen(1, 500);
    opened[0]?.onclose?.({ code: 1006, reason: '' });
    actor.send({ type: 'START', keywords: [] });
    await waitForOpen(2, 500);
    opened[1]?.onclose?.({ code: 1006, reason: '' });
    const grown = Date.now();
    actor.send({ type: 'START', keywords: [] });
    await waitForOpen(3, 1000);
    const grownWait = Date.now() - grown;
    opened[2]?.onmessage?.({ data: JSON.stringify({ type: 'ready' }) });
    await sleep(10);
    opened[2]?.onclose?.({ code: 1000, reason: '' });
    const reset = Date.now();
    actor.send({ type: 'START', keywords: [] });
    await waitForOpen(4, 1000);
    const resetWait = Date.now() - reset;
    assert.ok(resetWait < grownWait, `reset retry waited ${resetWait}ms after grown ${grownWait}ms`);
    actor.stop();
  } finally {
    restore();
  }
});

test('a start while a reopen is still opening keeps that socket (t20)', async () => {
  opened.length = 0;
  const restore = installSocket();
  try {
    const actor = createActor(streamClient, {
      input: { url: 'ws://localhost:8787', code: 'test', keywords: [], retryBaseMs: 30 },
    });
    actor.start();
    await waitForOpen(1, 500);
    opened[0]?.onmessage?.({ data: JSON.stringify({ type: 'ready' }) });
    opened[0]?.onclose?.({ code: 1006, reason: '' });
    actor.send({ type: 'START', keywords: [] });
    await waitForOpen(2, 500);
    actor.send({ type: 'START', keywords: ['قديلة'] });
    await sleep(120);
    assert.equal(opened.length, 2);
    assert.equal(opened[1]?.closed, false);
    opened[1]?.onmessage?.({ data: JSON.stringify({ type: 'ready' }) });
    opened[1]?.onclose?.({ code: 1006, reason: '' });
    actor.send({ type: 'START', keywords: [] });
    await waitForOpen(3, 500);
    actor.stop();
  } finally {
    restore();
  }
});
