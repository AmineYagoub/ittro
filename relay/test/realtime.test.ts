import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetaHandshake,
  parseMetaEvent,
  parsePhoneMessage,
  processedMsToUsd,
  startRealtimeSession,
} from '../src/index.ts';
import type { StreamBudget, StreamSocket } from '../src/index.ts';

function fakeSocket(): StreamSocket & { sent: Array<string | ArrayBuffer>; closed: boolean } {
  return {
    sent: [],
    closed: false,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: string | ArrayBuffer): void {
      this.sent.push(data);
    },
    close(): void {
      this.closed = true;
    },
  };
}

function fakeBudget(spent = 0): StreamBudget & { added: number[] } {
  const added: number[] = [];
  return {
    added,
    spendToday: async () => spent,
    addSpend: async (usd: number) => {
      added.push(usd);
    },
    budget: () => 3,
  };
}

test('builds the documented Meta handshake', () => {
  const handshake = buildMetaHandshake('key', ['Masaad']) as Record<string, unknown>;
  assert.deepEqual(handshake['authorization'], { accessToken: 'Bearer key' });
  assert.equal(handshake['audioEncoding'], 'PCM_24KHZ');
  assert.equal(handshake['model'], 'muse-voice-transcribe-1.0');
  assert.equal(handshake['mode'], 'ENDPOINTING');
  assert.deepEqual(handshake['keywords'], ['Masaad']);
});

test('parses the Meta stream events', () => {
  assert.equal(parseMetaEvent('{"sessionId":"abc"}')?.kind, 'ack');
  const start = parseMetaEvent('{"type":"speechStart","audioProcessedMs":0,"turnId":0}');
  assert.equal(start?.kind, 'speechStart');
  assert.equal(start?.audioProcessedMs, 0);
  const done = parseMetaEvent('{"type":"speechComplete","audioProcessedMs":1420,"turnId":0,"transcript":"Yes."}');
  assert.equal(done?.kind, 'speechComplete');
  assert.equal(done?.transcript, 'Yes.');
  const partial = parseMetaEvent('{"type":"transcript","transcript":"Ye","final":false,"audioProcessedMs":400}');
  assert.equal(partial?.kind, 'transcript');
  assert.equal(partial?.final, false);
  const failure = parseMetaEvent('{"type":"error","message":"Slow down","audioProcessedMs":100}');
  assert.equal(failure?.kind, 'error');
  assert.equal(failure?.message, 'Slow down');
  assert.equal(parseMetaEvent('nope'), null);
  assert.equal(parseMetaEvent('{"type":"mystery"}'), null);
});

test('validates the phone config message', () => {
  const config = parsePhoneMessage('{"type":"config","keywords":["Masaad water"]}');
  assert.equal(config?.kind, 'config');
  assert.equal(parsePhoneMessage('{"type":"end"}')?.kind, 'end');
  assert.equal(parsePhoneMessage('{"type":"config","keywords":"Masaad"}'), null);
  assert.equal(parsePhoneMessage('{"type":"config","keywords":[]}xx'), null);
  assert.equal(parsePhoneMessage('hello'), null);
});

test('prices processed audio, never phone claims', () => {
  assert.equal(processedMsToUsd(3600000), 0.18);
  assert.equal(processedMsToUsd(0), 0);
  assert.equal(processedMsToUsd(-5), 0);
});

test('config opens Meta, ack readies the phone', async () => {
  const client = fakeSocket();
  let meta: ReturnType<typeof fakeSocket> | null = null;
  startRealtimeSession(
    client,
    () => {
      meta = fakeSocket();
      return meta;
    },
    'wss://example.invalid',
    'key',
    fakeBudget(),
  );
  client.onmessage?.(JSON.stringify({ type: 'config', keywords: [] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(meta);
  (meta as unknown as ReturnType<typeof fakeSocket>).onopen?.();
  const sent = (meta as unknown as ReturnType<typeof fakeSocket>).sent;
  assert.equal(sent.length, 1);
  const handshake = JSON.parse(sent[0] as string) as Record<string, unknown>;
  assert.equal(handshake['mode'], 'ENDPOINTING');
  (meta as unknown as ReturnType<typeof fakeSocket>).onmessage?.('{"sessionId":"abc"}');
  assert.deepEqual(client.sent, [JSON.stringify({ type: 'ready' })]);
});

test('audio flows up, transcripts flow down, spend settles on end', async () => {
  const client = fakeSocket();
  let meta: ReturnType<typeof fakeSocket> | null = null;
  const budget = fakeBudget();
  startRealtimeSession(
    client,
    () => {
      meta = fakeSocket();
      return meta;
    },
    'wss://example.invalid',
    'key',
    budget,
  );
  client.onmessage?.(JSON.stringify({ type: 'config', keywords: [] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const downstream = meta as unknown as ReturnType<typeof fakeSocket>;
  downstream.onopen?.();
  downstream.onmessage?.('{"sessionId":"abc"}');
  const frame = new ArrayBuffer(3840);
  client.onmessage?.(frame);
  assert.ok(downstream.sent.includes(frame));
  downstream.onmessage?.('{"type":"speechComplete","audioProcessedMs":60000,"turnId":0,"transcript":"yes"}');
  const last = JSON.parse(client.sent[client.sent.length - 1] as string) as Record<string, unknown>;
  assert.equal(last['kind'], 'speechComplete');
  assert.equal(last['transcript'], 'yes');
  client.onmessage?.(JSON.stringify({ type: 'end' }));
  assert.deepEqual(downstream.sent[downstream.sent.length - 1], JSON.stringify({ type: 'endStream' }));
  downstream.onclose?.();
  assert.ok(client.closed);
  assert.equal(budget.added.length, 1);
  assert.equal(budget.added[0], processedMsToUsd(60000));
});

test('a Meta error reaches the phone as an error', async () => {
  const client = fakeSocket();
  let meta: ReturnType<typeof fakeSocket> | null = null;
  startRealtimeSession(
    client,
    () => {
      meta = fakeSocket();
      return meta;
    },
    'wss://example.invalid',
    'key',
    fakeBudget(),
  );
  client.onmessage?.(JSON.stringify({ type: 'config', keywords: [] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  (meta as unknown as ReturnType<typeof fakeSocket>).onopen?.();
  (meta as unknown as ReturnType<typeof fakeSocket>).onmessage?.(
    '{"type":"error","message":"Slow down","audioProcessedMs":5000}',
  );
  const last = JSON.parse(client.sent[client.sent.length - 1] as string) as Record<string, unknown>;
  assert.equal(last['type'], 'error');
  assert.equal(last['message'], 'Slow down');
  assert.ok(client.closed);
});

test('a spent budget refuses the stream before Meta opens', async () => {
  const client = fakeSocket();
  let opened = false;
  startRealtimeSession(
    client,
    () => {
      opened = true;
      return fakeSocket();
    },
    'wss://example.invalid',
    'key',
    fakeBudget(2.9999),
  );
  client.onmessage?.(JSON.stringify({ type: 'config', keywords: [] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(opened, false);
  const last = JSON.parse(client.sent[client.sent.length - 1] as string) as Record<string, unknown>;
  assert.match(String(last['message'] ?? ''), /daily budget/);
});

test('a bad first message closes the stream', async () => {
  const client = fakeSocket();
  startRealtimeSession(client, () => fakeSocket(), 'wss://example.invalid', 'key', fakeBudget());
  client.onmessage?.('hello');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(client.closed);
});
