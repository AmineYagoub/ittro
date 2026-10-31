// The confirm loop walked with scripted photos and cloud reads: a
// shot every 1.2 s, at most five per check, and an answer lands only
// in its own epoch with a fresh fix showing the hand unmoved since
// the photo; a missing or stale hand voids it, never a yes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfirmLoop } from '../src/confirm/loop';
import type { ConfirmLoopContext } from '../src/confirm/loopTypes';
import type { ConversationEvent } from '../src/conversation/types';
import { PHOTO, UNSURE, YES, fix, flush, read, scripted } from './confirm-harness';

test('the next photo goes while the previous read is in flight', async () => {
  const { script, loop, advance } = scripted();
  loop.begin();
  await flush();
  assert.equal(script.shots, 1);
  await advance(1200);
  assert.equal(script.shots, 2);
  script.answer(UNSURE);
  await flush();
  script.answer(UNSURE);
  await flush();
  assert.equal(script.sent.filter((event) => event.type === 'CONFIRM_UNSURE').length, 2);
  loop.stop();
});

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
    handNow: () => ({ x: 100, y: 100, confidence: 0.9, handWidth: 60, atMs: now }),
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

test('a held product swaying within a hand width still lands (t7: two reads dropped as moved)', async () => {
  const { script, loop } = scripted();
  script.hand = { ...fix(400, 400), handWidth: 135 };
  loop.begin();
  await flush();
  script.hand = { ...fix(520, 470), handWidth: 135 };
  script.answer(YES);
  await flush();
  assert.equal(script.sent[0]?.type, 'CONFIRM_YES');
  loop.stop();
});
