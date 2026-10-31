// One Meta call through the relay: every request logs when it
// leaves and when it lands, and every failure carries its kind, so
// the statechart says network loss, limits and broken answers each
// once. Down is a dead route; limited is the relay asking to slow
// down or the day's budget spent; broken is anything else.
import Constants from 'expo-constants';
import { logIttro } from './log';

export type LinkKind = 'down' | 'limited' | 'broken';

export class RelayError extends Error {
  kind: LinkKind;
  status: number | null;
  constructor(kind: LinkKind, status: number | null, message: string) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export function linkKindFor(error: unknown): LinkKind {
  return error instanceof RelayError ? error.kind : 'broken';
}

function noteMeta(line: string): void {
  logIttro(`meta ${line}`);
}

export function relayEndpoint(): { url: string; accessCode: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const url = process.env['EXPO_PUBLIC_RELAY_URL'] ?? extra['relayUrl'];
  const accessCode = process.env['EXPO_PUBLIC_ACCESS_CODE'] ?? extra['accessCode'];
  return {
    url: typeof url === 'string' ? url : 'https://ittro.djazair.dev',
    accessCode: typeof accessCode === 'string' ? accessCode : '',
  };
}

// No call waits forever: a relay that never answers counts as down
// after this long, so the statechart says so and moves on instead of
// ticking in silence.
export const RELAY_TIMEOUT_MS = 15000;

async function sendMeta<T>(name: string, path: string, method: string, payload: unknown): Promise<T> {
  const { url, accessCode } = relayEndpoint();
  const started = Date.now();
  noteMeta(`${name} sent`);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RELAY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessCode}`,
      },
      body: method === 'GET' ? undefined : JSON.stringify(payload),
      signal: abort.signal,
    });
  } catch (error) {
    const why = abort.signal.aborted ? `timed out after ${RELAY_TIMEOUT_MS}ms` : String((error as Error)?.message ?? error);
    noteMeta(`${name} failed down ${Date.now() - started}ms ${abort.signal.aborted ? 'timeout' : ''}`.trimEnd());
    throw new RelayError('down', null, `no route to the relay: ${why}`);
  } finally {
    clearTimeout(timer);
  }
  const elapsed = Date.now() - started;
  if (res.status === 429 || res.status === 402) {
    noteMeta(`${name} failed limited ${elapsed}ms http ${res.status}`);
    throw new RelayError('limited', res.status, `relay limit reached, http ${res.status}`);
  }
  if (!res.ok) {
    noteMeta(`${name} failed broken ${elapsed}ms http ${res.status}`);
    throw new RelayError('broken', res.status, `relay http ${res.status}`);
  }
  let body: { ok: boolean; error?: string } & Partial<T>;
  try {
    body = (await res.json()) as { ok: boolean; error?: string } & Partial<T>;
  } catch {
    noteMeta(`${name} failed broken ${elapsed}ms bad json`);
    throw new RelayError('broken', res.status, 'relay answer is not json');
  }
  if (!body.ok) {
    noteMeta(`${name} failed broken ${elapsed}ms ${String(body.error ?? 'refused').slice(0, 60)}`);
    throw new RelayError('broken', res.status, String(body.error ?? 'relay refused'));
  }
  noteMeta(`${name} ok ${elapsed}ms`);
  return body as T;
}

export function postMeta<T>(name: string, path: string, payload: unknown): Promise<T> {
  return sendMeta<T>(name, path, 'POST', payload);
}

export function getMeta<T>(name: string, path: string): Promise<T> {
  return sendMeta<T>(name, path, 'GET', null);
}
