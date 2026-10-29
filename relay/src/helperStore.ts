// The helper store backends: the relay's own KV on Workers, so
// pairings, helpers and questions survive across isolates, and an
// in-memory twin for tests and local runs without storage. Both
// honor expiries; the logic also checks them, so a fake clock still
// expires entries in tests.
import type { PushSubscription } from './push.ts';

export interface HelperKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds?: number): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface KvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options: { prefix: string }): Promise<{ keys: Array<{ name: string }> }>;
}

export function kvHelperStore(binding: KvBinding): HelperKv {
  return {
    get: (key) => binding.get(key),
    put: (key, value, ttlSeconds) =>
      binding.put(key, value, ttlSeconds === undefined ? undefined : { expirationTtl: ttlSeconds }),
    list: async (prefix) => (await binding.list({ prefix })).keys.map((entry) => entry.name),
  };
}

export interface HelperPairing {
  name: string;
  code: string;
  createdAt: number;
  joinedToken: string | null;
}

export type HelperVerdict = 'yes' | 'no' | 'cant_tell';

export interface StoredHelper {
  name: string;
  token: string;
  push: PushSubscription | null;
  createdAt: number;
}

export interface HelperAnswer {
  verdict: HelperVerdict;
  note: string | null;
  helper: string;
}

export interface StoredQuestion {
  id: string;
  tokens: string[];
  names: string[];
  question: string;
  request: string;
  read: string;
  image: string | null;
  mime: string;
  createdAt: number;
  status: 'waiting' | 'answered' | 'cancelled';
  answer: HelperAnswer | null;
}

const MIN_REMAINING_S = 60;

export function recordExpired(now: number, createdAt: number, ttlMs: number): boolean {
  return now - createdAt >= ttlMs;
}

export function remainingTtlS(now: number, createdAt: number, ttlMs: number): number {
  return Math.max(MIN_REMAINING_S, Math.ceil((ttlMs - (now - createdAt)) / 1000));
}

export async function readRecord<T>(kv: HelperKv, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readPairing(kv: HelperKv, code: string, now: number, ttlMs: number): Promise<HelperPairing | null> {
  const pairing = await readRecord<HelperPairing>(kv, `pair:${code}`);
  if (!pairing || recordExpired(now, pairing.createdAt, ttlMs)) {
    return null;
  }
  return pairing;
}

export async function readQuestion(kv: HelperKv, id: string, now: number, ttlMs: number): Promise<StoredQuestion | null> {
  const question = await readRecord<StoredQuestion>(kv, `question:${id}`);
  if (!question || recordExpired(now, question.createdAt, ttlMs)) {
    return null;
  }
  return question;
}

export function memoryHelperStore(now: () => number = () => Date.now()): HelperKv {
  const values = new Map<string, { value: string; expiresAt: number | null }>();
  function live(key: string): string | null {
    const held = values.get(key);
    if (!held) {
      return null;
    }
    if (held.expiresAt !== null && now() >= held.expiresAt) {
      values.delete(key);
      return null;
    }
    return held.value;
  }
  return {
    get: async (key) => live(key),
    put: async (key, value, ttlSeconds) => {
      values.set(key, { value, expiresAt: ttlSeconds === undefined ? null : now() + ttlSeconds * 1000 });
    },
    list: async (prefix) => {
      const names: string[] = [];
      for (const key of [...values.keys()]) {
        if (live(key) !== null && key.startsWith(prefix)) {
          names.push(key);
        }
      }
      return names;
    },
  };
}
