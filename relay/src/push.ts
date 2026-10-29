// Web Push tickles for helpers: a signal-only push (no body, so no
// payload encryption) signed with VAPID. The helper's page polls for
// the question itself, so a failed or missing push only costs speed,
// never the answer. Keys live in the environment, never in git.
import type { Env } from './gate.ts';

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function base64UrlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let at = 0; at < bin.length; at += 1) {
    out[at] = bin.charCodeAt(at);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let at = 0; at < bytes.length; at += 1) {
    bin += String.fromCharCode(bytes[at]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function subscriptionValid(push: unknown): push is PushSubscription {
  if (!push || typeof push !== 'object') {
    return false;
  }
  const record = push as Record<string, unknown>;
  const keys = record['keys'] as Record<string, unknown> | undefined;
  return (
    typeof record['endpoint'] === 'string' &&
    (record['endpoint'] as string).startsWith('https://') &&
    !!keys &&
    typeof keys['p256dh'] === 'string' &&
    typeof keys['auth'] === 'string'
  );
}

export function readPushSubscription(body: Record<string, unknown>): PushSubscription | null {
  const push = body['push'];
  if (push === null || push === undefined) {
    return null;
  }
  return subscriptionValid(push) ? push : null;
}

export function pushSubscriptionInvalid(body: Record<string, unknown>): boolean {
  const push = body['push'];
  return push !== null && push !== undefined && !subscriptionValid(push);
}

export async function vapidJwt(env: Env, audience: string, cryptoImpl = crypto): Promise<string | null> {
  const rawPrivate = env.VAPID_PRIVATE_KEY ?? '';
  const rawPublic = env.VAPID_PUBLIC_KEY ?? '';
  if (!rawPrivate || !rawPublic) {
    return null;
  }
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: env.VAPID_SUBJECT ?? 'mailto:help@ittro.example' }),
    ),
  );
  const signingInput = new TextEncoder().encode(`${header}.${claims}`);
  const jwk = { kty: 'EC', crv: 'P-256', x: '', y: '', d: '' };
  const privBytes = base64UrlToBytes(rawPrivate);
  const pubBytes = base64UrlToBytes(rawPublic);
  if (privBytes.length !== 32 || pubBytes.length !== 65 || pubBytes[0] !== 4) {
    return null;
  }
  jwk.d = bytesToBase64Url(privBytes);
  jwk.x = bytesToBase64Url(pubBytes.slice(1, 33));
  jwk.y = bytesToBase64Url(pubBytes.slice(33, 65));
  const key = await cryptoImpl.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await cryptoImpl.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput));
  return `${header}.${claims}.${bytesToBase64Url(signature)}`;
}

export async function sendTickle(
  fetchImpl: typeof fetch,
  env: Env,
  push: PushSubscription,
): Promise<{ sent: boolean; status: number }> {
  const jwt = await vapidJwt(env, new URL(push.endpoint).origin);
  if (!jwt) {
    return { sent: false, status: 0 };
  }
  try {
    const res = await fetchImpl(push.endpoint, {
      method: 'POST',
      headers: { authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY ?? ''}`, urgency: 'high', ttl: '300' },
    });
    return { sent: res.ok, status: res.status };
  } catch {
    return { sent: false, status: 0 };
  }
}
