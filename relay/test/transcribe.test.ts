import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeClip, wavSeconds } from '../src/index.ts';

function stubFetch(body: unknown): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => body,
  })) as unknown as typeof fetch;
}

function tinyWav(): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + 4800);
  const view = new DataView(buffer);
  view.setUint32(24, 24000, true);
  view.setUint32(40, 4800, true);
  return buffer;
}

test('reads turns from the transcribe answer', async () => {
  const text = await transcribeClip(
    stubFetch({ turns: [{ text: 'Masaad' }, { text: 'water' }] }),
    'https://example.invalid',
    'key',
    tinyWav(),
    'en-US',
    [],
  );
  assert.equal(text, 'Masaad water');
});

test('accepts a plain text answer', async () => {
  const text = await transcribeClip(
    stubFetch({ text: '  yes  ' }),
    'https://example.invalid',
    'key',
    tinyWav(),
    'fr-FR',
    [],
  );
  assert.equal(text, 'yes');
});

test('treats a silent clip as empty text, not failure', async () => {
  const text = await transcribeClip(
    stubFetch({ transcript: '', audioDurationMs: 7040, turns: [] }),
    'https://example.invalid',
    'key',
    tinyWav(),
    'en-US',
    [],
  );
  assert.equal(text, '');
});

test('rejects answers with no transcript instead of guessing', async () => {
  await assert.rejects(
    transcribeClip(stubFetch({ sessionId: 'abc' }), 'https://example.invalid', 'key', tinyWav(), 'en-US', []),
    /no transcript/,
  );
});

test('sends the documented recording fields', async () => {
  let seen: FormData | null = null;
  const fetchImpl = (async (_url: string, init: { body: FormData }) => {
    seen = init.body;
    return { ok: true, json: async () => ({ text: 'ok' }) };
  }) as unknown as typeof fetch;
  await transcribeClip(fetchImpl, 'https://example.invalid', 'key', tinyWav(), 'ar-SA', ['Masaad']);
  assert.ok(seen instanceof FormData);
  assert.equal(
    seen.get('request'),
    JSON.stringify({
      model: 'muse-voice-transcribe-1.0',
      mode: 'PUSH_TO_TALK',
      language: 'ar-SA',
      audioEncoding: 'WAV',
      keywords: ['Masaad'],
    }),
  );
  assert.ok(seen.get('audio') instanceof Blob);
});

test('reads the transcript field of the live answer', async () => {
  const text = await transcribeClip(
    stubFetch({ transcript: 'Yes.', audioDurationMs: 720, turns: [] }),
    'https://example.invalid',
    'key',
    tinyWav(),
    'en-US',
    [],
  );
  assert.equal(text, 'Yes.');
});

test('works out clip seconds from the wav header', () => {
  const buffer = new ArrayBuffer(44 + 32000);
  const bytes = new Uint8Array(buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  const view = new DataView(buffer);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint16(34, 16, true);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, 32000, true);
  assert.equal(wavSeconds(buffer), 1);
});

test('rejects a clip with no wav header instead of guessing', () => {
  assert.throws(() => wavSeconds(new ArrayBuffer(100)), /not a wav/);
});
