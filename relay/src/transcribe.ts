// Meta Voice Transcribe: turns a captured clip into words. A heard
// clip with no words comes back as empty text; failures throw, so
// silence and failure still differ.
export const TRANSCRIBE_USD_PER_SECOND = 0.18 / 3600;

const TRANSCRIBE_MODEL = 'muse-voice-transcribe-1.0';

export function wavSeconds(wav: ArrayBuffer): number {
  const bytes = new Uint8Array(wav);
  if (bytes.length < 44) {
    throw new Error('clip is not a wav');
  }
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  if (head !== 'RIFF') {
    throw new Error('clip is not a wav');
  }
  const view = new DataView(wav);
  const channels = view.getUint16(22, true);
  const rate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  const bytesPerSecond = (rate * channels * bits) / 8;
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    throw new Error('clip is not a wav');
  }
  let dataBytes = -1;
  for (let at = 12; at + 8 <= bytes.length; at += 1) {
    if (
      bytes[at] === 0x64 &&
      bytes[at + 1] === 0x61 &&
      bytes[at + 2] === 0x74 &&
      bytes[at + 3] === 0x61
    ) {
      dataBytes = view.getUint32(at + 4, true);
      break;
    }
  }
  if (dataBytes < 0) {
    throw new Error('clip is not a wav');
  }
  return dataBytes / bytesPerSecond;
}

export async function transcribeClip(
  fetchImpl: typeof fetch,
  apiBase: string,
  apiKey: string,
  wav: ArrayBuffer,
  language: string,
  keywords: string[],
): Promise<string> {
  const requestPart: Record<string, unknown> = {
    model: TRANSCRIBE_MODEL,
    mode: 'PUSH_TO_TALK',
    language,
    audioEncoding: 'WAV',
  };
  if (keywords.length > 0) {
    requestPart['keywords'] = keywords;
  }
  const form = new FormData();
  form.append('request', JSON.stringify(requestPart));
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
  const res = await fetchImpl(`${apiBase}/asr/transcribe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`transcribe http ${res.status}`);
  }
  const body = (await res.json()) as {
    transcript?: unknown;
    turns?: Array<{ text?: unknown }>;
    text?: unknown;
  };
  if (typeof body.transcript === 'string') {
    return body.transcript.trim();
  }
  if (Array.isArray(body.turns)) {
    return body.turns
      .map((turn) => (typeof turn.text === 'string' ? turn.text : ''))
      .join(' ')
      .trim();
  }
  if (typeof body.text === 'string') {
    return body.text.trim();
  }
  throw new Error('transcribe answer has no transcript');
}
