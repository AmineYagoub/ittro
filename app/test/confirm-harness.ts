// Shared harness for the confirm loop tests: scripted photos and
// cloud reads on a scripted clock, with a hand fix that stays fresh
// across advances like the phone's tracked hand.
import { createConfirmLoop } from '../src/confirm/loop';
import type { ConfirmLoopContext } from '../src/confirm/loopTypes';
import type { HandFix } from '../src/guide/types';
import type { ConfirmRead, DetailKind } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';

export const PHOTO = { image: 'aGk=', mime: 'image/jpeg', crop: 'data:image/jpeg;base64,aGk=' };

export const ASKED = { brand: 'Masaad', product: 'water', variant: null, size: '1.5 litres' };

export function read(patch: Partial<ConfirmRead>): ConfirmRead {
  return {
    verdict: 'yes',
    picture_problem: null,
    asked: ASKED,
    read: { brand: null, product: null, variant: null, size: null },
    label_name: 'Masaad water',
    unreadable: [],
    ...patch,
  };
}

export const YES = read({ verdict: 'yes', read: { brand: 'Masaad', product: 'water', variant: null, size: '1.5 litres' } });

export const UNSURE = read({
  verdict: 'unsure',
  read: { brand: 'Masaad', product: null, variant: null, size: null },
  label_name: 'Masaad',
  unreadable: ['size'],
});

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function flush(rounds = 30): Promise<void> {
  for (let row = 0; row < rounds; row += 1) {
    await Promise.resolve();
  }
}

export interface Script {
  shots: number;
  sent: ConversationEvent[];
  ctx: ConfirmLoopContext;
  detailKind: DetailKind | null;
  hand: HandFix | null;
  answer: (read: ConfirmRead) => void;
}

export function scripted(): {
  script: Script;
  loop: ReturnType<typeof createConfirmLoop>;
  advance: (ms: number) => Promise<void>;
  pending: () => number;
} {
  let now = 0;
  const script: Script = {
    shots: 0,
    sent: [],
    ctx: { epoch: 1, request: 'Masaad water', detailKind: null, final: false },
    detailKind: null,
    hand: { x: 100, y: 100, confidence: 0.9, handWidth: 60, atMs: 0 },
    answer: () => {},
  };
  const waiting: Array<(read: ConfirmRead) => void> = [];
  script.answer = (got: ConfirmRead) => {
    const next = waiting.shift();
    if (next) {
      next(got);
    }
  };
  const loop = createConfirmLoop({
    now: () => now,
    shoot: async () => {
      script.shots += 1;
      return PHOTO;
    },
    confirm: async () => {
      const gate = deferred<ConfirmRead>();
      waiting.push((got) => gate.resolve(got));
      const got = await gate.promise;
      return { read: got, readMs: 120 };
    },
    detail: async (kind) => ({ read: { text: kind === 'date' ? 'best before 12 March 2027' : null, reason: null }, readMs: 90 }),
    readContext: () => script.ctx,
    handNow: () => script.hand,
    send: (event) => {
      script.sent.push(event);
    },
    log: () => {},
  });
  return {
    script,
    loop,
    pending: () => waiting.length,
    advance: async (ms: number) => {
      now += ms;
      if (script.hand) {
        script.hand = { ...script.hand, atMs: now };
      }
      loop.tick();
      await flush();
    },
  };
}

export function fix(x: number, y: number, atMs = 0): HandFix {
  return { x, y, confidence: 0.9, handWidth: 60, atMs };
}
