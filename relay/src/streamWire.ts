// The realtime wire: the Meta handshake, the Meta event shapes, the
// phone message shapes, and the socket wrapper both runtimes share.
export interface StreamSocket {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((data: string | ArrayBuffer) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

interface StandardSocket {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export function wrapSocket(ws: StandardSocket): StreamSocket {
  const socket: StreamSocket = {
    send: (data) => ws.send(data),
    close: (code, reason) => ws.close(code, reason),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  ws.onopen = (): void => {
    socket.onopen?.();
  };
  ws.onmessage = (event): void => {
    const data = event.data;
    if (typeof data === 'string') {
      socket.onmessage?.(data);
    } else if (data instanceof ArrayBuffer) {
      socket.onmessage?.(data);
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      void data.arrayBuffer().then((buffer) => socket.onmessage?.(buffer));
    }
  };
  ws.onclose = (): void => {
    socket.onclose?.();
  };
  ws.onerror = (): void => {
    socket.onerror?.();
  };
  return socket;
}

const META_MODEL = 'muse-voice-transcribe-1.0';

const LANGUAGE_BIAS = ['English', 'Arabic', 'French'];

export function buildMetaHandshake(apiKey: string, keywords: string[]): Record<string, unknown> {
  return {
    authorization: { accessToken: `Bearer ${apiKey}` },
    audioEncoding: 'PCM_24KHZ',
    model: META_MODEL,
    mode: 'ENDPOINTING',
    partialMode: 'CUMULATIVE',
    emitAudioProgress: false,
    keywords,
    languageBias: LANGUAGE_BIAS,
  };
}

export type MetaEventKind = 'ack' | 'speechStart' | 'speechEnd' | 'speechComplete' | 'transcript' | 'error';

export interface MetaEvent {
  kind: MetaEventKind;
  sessionId?: string;
  turnId?: number;
  transcript?: string;
  final?: boolean;
  audioProcessedMs: number;
  message?: string;
}

export function parseMetaEvent(text: string): MetaEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const ms = typeof body['audioProcessedMs'] === 'number' ? body['audioProcessedMs'] : 0;
  if (typeof body['sessionId'] === 'string' && typeof body['type'] !== 'string') {
    return { kind: 'ack', sessionId: body['sessionId'], audioProcessedMs: ms };
  }
  const type = body['type'];
  const turn = typeof body['turnId'] === 'number' ? body['turnId'] : undefined;
  if (type === 'speechStart') {
    return { kind: 'speechStart', turnId: turn, audioProcessedMs: ms };
  }
  if (type === 'speechEnd') {
    return { kind: 'speechEnd', turnId: turn, audioProcessedMs: ms };
  }
  if (type === 'speechComplete') {
    return {
      kind: 'speechComplete',
      turnId: turn,
      transcript: typeof body['transcript'] === 'string' ? body['transcript'] : '',
      audioProcessedMs: ms,
    };
  }
  if (type === 'transcript') {
    return {
      kind: 'transcript',
      transcript: typeof body['transcript'] === 'string' ? body['transcript'] : '',
      final: body['final'] === true,
      audioProcessedMs: ms,
    };
  }
  if (type === 'error') {
    return {
      kind: 'error',
      message: typeof body['message'] === 'string' ? body['message'] : 'transcribe stream error',
      audioProcessedMs: ms,
    };
  }
  return null;
}

export type PhoneMessage = { kind: 'config'; keywords: string[] } | { kind: 'end' };

export function parsePhoneMessage(text: string): PhoneMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const body = raw as Record<string, unknown>;
  if (body['type'] === 'end') {
    return { kind: 'end' };
  }
  if (body['type'] === 'config' && Array.isArray(body['keywords'])) {
    const words = body['keywords'];
    if (words.length > 24 || !words.every((w) => typeof w === 'string' && w.length > 0 && w.length <= 40)) {
      return null;
    }
    return { kind: 'config', keywords: [...words] };
  }
  return null;
}
