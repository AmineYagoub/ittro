// The confirm loop walked with scripted photos and cloud reads: a
// shot every 1.2 s, at most five per check, and an answer lands only
// in its own epoch with the hand unmoved since the photo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfirmLoop } from '../src/confirm/loop';
import type { ConfirmLoopContext } from '../src/confirm/loopTypes';
import type { HandFix } from '../src/guide/types';
import type { ConfirmRead, DetailKind } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';

const PHOTO = { image: 'aGk=', mime: 'image/jpeg', crop: 'data:image/jpeg;base64,aGk=' };

const ASKED = { brand: 'Masaad', product: 'water', variant: null, size: '1.5 litres' };

function read(patch: Partial<ConfirmRead>): ConfirmRead {
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

const YES = read({ verdict: 'yes', read: { brand: 'Masaad', product: 'water', variant: null, size: '1.5 litres' } });

const UNSURE = read({
  verdict: 'unsure',
  read: { brand: 'Masaad', product: null, variant: null, size: null },
  label_name: 'Masaad',
  unreadable: ['size'],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(rounds = 30): Promise<void> {
  for (let row = 0; row < rounds; row += 1) {
    await Promise.resolve();
  }
}

interface Script {
  shots: number;
  sent: ConversationEvent[];
  ctx: ConfirmLoopContext;
  detailKind: DetailKind | null;
  hand: HandFix | null;
  answer: (read: ConfirmRead) => void;
}

function scripted(): {
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
    hand: null,
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
      loop.tick();
      await flush();
    },
  };
}

function fix(x: number, y: number): HandFix {
  return { x, y, confidence: 0.9, handWidth: 60, atMs: 0 };
}

test('the first shot goes at once and a yes lands with its crop', async () => {
  const { script, loop } = scripted();
  loop.begin();
  await flush();
  assert.equal(script.shots, 1);
  script.answer(YES);
  await flush();
  assert.deepEqual(script.sent, [
    { type: 'CONFIRM_YES', epoch: 1, label: 'Masaad water', crop: PHOTO.crop },
    { type: 'LINK_OK' },
  ]);
  loop.stop();
});

test('shots wait 1.2 s and five unsure tries end in a giveup', async () => {
  const { script, loop, advance } = scripted();
  loop.begin();
  await flush();
  for (let shot = 1; shot <= 5; shot += 1) {
    assert.equal(script.shots, shot);
    script.answer(UNSURE);
    await flush();
    await advance(1200);
  }
  assert.equal(script.shots, 5);
  assert.equal(script.sent.filter((event) => event.type === 'CONFIRM_UNSURE').length, 5);
  assert.equal(script.sent.at(-1)?.type, 'CONFIRM_GIVEUP');
  await advance(5000);
  assert.equal(script.shots, 5);
  loop.stop();
});

test('a final verdict stops the shooting', async () => {
  const { script, loop, advance } = scripted();
  loop.begin();
  await flush();
  script.answer(YES);
  await flush();
  script.ctx.final = true;
  await advance(5000);
  assert.equal(script.shots, 1);
  loop.stop();
});

test('an answer about a moved hand is dropped and reread', async () => {
  const { script, loop, advance } = scripted();
  script.hand = fix(100, 100);
  loop.begin();
  await flush();
  script.hand = fix(500, 500);
  script.answer(YES);
  await flush();
  assert.deepEqual(script.sent, [{ type: 'CONFIRM_MOVED', epoch: 1 }]);
  script.ctx.epoch = 2;
  await advance(1200);
  assert.equal(script.shots, 2);
  script.answer(YES);
  await flush();
  assert.equal(script.sent.at(-2)?.type, 'CONFIRM_YES');
  assert.equal((script.sent.at(-2) as { epoch: number }).epoch, 2);
  assert.equal(script.sent.at(-1)?.type, 'LINK_OK');
  loop.stop();
});

test('without hand data the answer still lands', async () => {
  const { script, loop } = scripted();
  loop.begin();
  await flush();
  script.answer(YES);
  await flush();
  assert.equal(script.sent.at(-2)?.type, 'CONFIRM_YES');
  assert.equal(script.sent.at(-1)?.type, 'LINK_OK');
  loop.stop();
});

test('a stale epoch answer is dropped', async () => {
  const { script, loop } = scripted();
  loop.begin();
  await flush();
  script.ctx.epoch = 2;
  script.answer(YES);
  await flush();
  assert.deepEqual(script.sent, []);
  loop.stop();
});

test('two reads may fly while a third waits', async () => {
  const { script, loop, advance, pending } = scripted();
  loop.begin();
  await flush();
  await advance(1200);
  await advance(1200);
  assert.equal(script.shots, 2);
  assert.equal(pending(), 2);
  script.answer(UNSURE);
  await flush();
  await advance(1200);
  assert.equal(script.shots, 3);
  loop.stop();
});

test('a picture verdict without a problem is never a doubt', async () => {
  const { script, loop } = scripted();
  loop.begin();
  await flush();
  script.answer(read({ verdict: 'picture', picture_problem: null, label_name: 'Masaad', unreadable: ['size'] }));
  await flush();
  assert.equal(script.sent.at(-2)?.type, 'CONFIRM_UNSURE');
  assert.equal(script.sent.at(-1)?.type, 'LINK_OK');
  loop.stop();
});

test('a failed shot retries without spending a try', async () => {
  let now = 0;
  const sent: ConversationEvent[] = [];
  let shots = 0;
  const ctx: ConfirmLoopContext = { epoch: 1, request: 'Masaad water', detailKind: null, final: false };
  const loop = createConfirmLoop({
    now: () => now,
    shoot: async () => {
      shots += 1;
      return shots < 3 ? null : PHOTO;
    },
    confirm: async () => ({ read: YES, readMs: 120 }),
    detail: async () => ({ read: { text: null, reason: 'too_small' }, readMs: 90 }),
    readContext: () => ctx,
    handNow: () => null,
    send: (event) => {
      sent.push(event);
    },
    log: () => {},
  });
  loop.begin();
  await flush();
  assert.equal(sent.at(-1)?.type, 'CONFIRM_FAILED');
  now += 1200;
  loop.tick();
  await flush();
  assert.equal(shots, 1);
  now += 2800;
  loop.tick();
  await flush();
  assert.equal(shots, 2);
  now += 4000;
  loop.tick();
  await flush();
  assert.equal(shots, 3);
  assert.equal(sent.at(-2)?.type, 'CONFIRM_YES');
  assert.equal(sent.at(-1)?.type, 'LINK_OK');
  loop.stop();
});

test('a detail reads once from one photo', async () => {
  const { script, loop, advance } = scripted();
  script.ctx.detailKind = 'date';
  loop.begin();
  await flush();
  assert.equal(script.shots, 1);
  assert.deepEqual(script.sent, [
    { type: 'CONFIRM_DETAIL', epoch: 1, text: 'best before 12 March 2027', reason: null, crop: PHOTO.crop },
    { type: 'LINK_OK' },
  ]);
  script.ctx.final = true;
  await advance(5000);
  assert.equal(script.shots, 1);
  loop.stop();
});
