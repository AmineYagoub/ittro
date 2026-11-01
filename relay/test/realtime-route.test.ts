// The /realtime route end to end over fake sockets: once 30 s of audio
// is processed the stream bills it to the day's spend and still hands
// the phone every event. d7a7106 dropped the spend helper's import, so
// each charge threw and the event that crossed it never reached the
// phone, and the end of a stream threw before closing Meta's socket.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';

interface FakeSocket {
  sent: unknown[];
  closed: boolean;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: unknown): void;
  close(): void;
  accept(): void;
}

function fakeSocket(): FakeSocket {
  return {
    sent: [],
    closed: false,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: unknown): void {
      this.sent.push(data);
    },
    close(): void {
      this.closed = true;
    },
    accept(): void {
      return undefined;
    },
  };
}

function kvOf(store: Map<string, string>) {
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const CODE = 'test-code-123';

async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('a long stream bills its audio, forwards every event and closes Meta at the end', async () => {
  const phone = fakeSocket();
  const relaySide = fakeSocket();
  const metas: FakeSocket[] = [];
  const scope = globalThis as unknown as Record<string, unknown>;
  const saved = { pair: scope['WebSocketPair'], socket: scope['WebSocket'] };
  scope['WebSocketPair'] = function WebSocketPair() {
    return [phone, relaySide];
  };
  scope['WebSocket'] = function WebSocket() {
    const meta = fakeSocket();
    metas.push(meta);
    return meta;
  };
  try {
    const store = new Map<string, string>();
    const env = { APP_ACCESS_CODE: CODE, ITTRO_LIMITS: kvOf(store), META_API_BASE: 'https://example.invalid', META_API_KEY: 'key' };
    const upgrade = new Request(`http://relay/realtime?code=${CODE}`, { headers: { upgrade: 'websocket' } });
    await worker.fetch(upgrade, env as never).catch(() => undefined);
    relaySide.onmessage?.({ data: JSON.stringify({ type: 'config', keywords: ['Masaad'] }) });
    await settle();
    const meta = metas[0];
    assert.ok(meta, 'the relay opened a Meta socket');
    meta.onopen?.();
    meta.onmessage?.({ data: JSON.stringify({ sessionId: 'abc' }) });
    meta.onmessage?.({ data: JSON.stringify({ type: 'speechComplete', audioProcessedMs: 31000, turnId: 0, transcript: 'Yes.' }) });
    await settle();
    assert.ok(relaySide.sent.map(String).some((message) => message.includes('"Yes."')), 'the transcript reached the phone');
    const spent = [...store.entries()].filter(([key]) => key.startsWith('spend:')).reduce((sum, [, value]) => sum + Number(value), 0);
    assert.ok(spent > 0, 'the audio was billed');
    meta.onmessage?.({ data: JSON.stringify({ type: 'transcript', transcript: 'Ma', final: false, audioProcessedMs: 33000 }) });
    relaySide.onclose?.();
    await settle();
    assert.equal(meta.closed, true, "Meta's socket is closed at the end");
  } finally {
    scope['WebSocketPair'] = saved.pair;
    scope['WebSocket'] = saved.socket;
  }
});
