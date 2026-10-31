// The guiding moments walked on the real statechart: aiming from the
// found product, directing with repeats, almost, reach forward, pick
// it up, a lost hand, no hand, a wrong product and a lost target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { ShelfOutline } from '../src/relay';

function outline(id: number, x1: number, y1: number, x2: number, y2: number): ShelfOutline {
  return { id, frame: 3, box: { x1, y1, x2, y2, w: 1280, h: 960, confidence: null } };
}

const TARGET = outline(7, 600, 400, 760, 640);

function found(matches = 1, position: 'left' | 'middle' | 'right' = 'middle') {
  return { type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches, kind: 'bottles', position } as const;
}

function cue(cueId: string, proximity = 0.4) {
  return { type: 'GUIDE_CUE', cue: cueId, proximity, hand: { x: 300, y: 520 } } as const;
}

async function guiding(matches = 1) {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send(found(matches));
  await driver.flush();
  assert.equal(driver.guide(), 'aiming');
  driver.send(cue('hand_right'));
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  return driver;
}

test('finding the product aims, then the first cue names it and the way', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send(found());
  await driver.flush();
  assert.equal(driver.guide(), 'aiming');
  assert.equal(driver.context().guiding, true);
  driver.send(cue('hand_right'));
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  assert.deepEqual(driver.parts, [
    [{ text: 'I found Masaad water in the middle.' }],
    [{ text: 'Masaad water is to your right.' }, { clip: 'hand_right' }],
  ]);
  assert.equal(driver.context().lastLine, 'Masaad water is to your right. Move your hand right.');
  driver.stop();
});

test('several matches say how many and guide to the nearest one', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send(found(3));
  await driver.flush();
  driver.send(cue('hand_left'));
  await driver.flush();
  assert.deepEqual(driver.parts, [
    [{ text: 'I found Masaad water in the middle.' }],
    [
      { text: 'I see three Masaad water bottles. Guiding you to the nearest one, in the middle. Masaad water is to your left.' },
      { clip: 'hand_left' },
    ],
  ]);
  driver.stop();
});

test('a repeat of the same cue stays silent, a new cue speaks', async () => {
  const driver = await guiding();
  driver.send(cue('hand_right', 0.5));
  await driver.flush();
  assert.equal(driver.parts.length, 2);
  driver.send(cue('hand_right_small', 0.7));
  await driver.flush();
  assert.equal(driver.parts.length, 3);
  assert.deepEqual(driver.parts[2], [{ clip: 'hand_right_small' }]);
  driver.stop();
});

test('an unchanged direction repeats as a continuation every six seconds', async () => {
  const driver = await guiding();
  await driver.advance(6000);
  assert.equal(driver.parts.length, 3);
  assert.deepEqual(driver.parts[2], [{ clip: 'hand_right_continue' }]);
  driver.stop();
});

test('almost, reach forward and pick it up walk in order', async () => {
  const driver = await guiding();
  driver.send({ type: 'GUIDE_ALIGNED', proximity: 0.9, hand: { x: 595, y: 520 } });
  await driver.flush();
  assert.equal(driver.guide(), 'almost');
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'almost' }]);
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 680, y: 520 } });
  await driver.flush();
  assert.equal(driver.guide(), 'reaching');
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'reach_forward' }]);
  driver.send({ type: 'GUIDE_GOT_IT' });
  assert.equal(driver.guide(), 'picking');
  await driver.flush();
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'pick_up' }, { clip: 'checking' }]);
  assert.equal(driver.guide(), 'idle');
  assert.equal(driver.context().guiding, false);
  driver.stop();
});

test('contact with the outline picks up only from reach forward', async () => {
  const driver = await guiding();
  driver.send({ type: 'GUIDE_CONTACT' });
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 680, y: 520 } });
  await driver.flush();
  assert.equal(driver.guide(), 'reaching');
  driver.send({ type: 'GUIDE_CONTACT' });
  assert.equal(driver.guide(), 'picking');
  await driver.flush();
  assert.equal(driver.guide(), 'idle');
  driver.stop();
});

test('no hand asks for the hand every six seconds until it returns', async () => {
  const driver = await guiding();
  driver.send({ type: 'GUIDE_NOHAND' });
  await driver.flush();
  assert.equal(driver.guide(), 'noHand');
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'hand_show' }]);
  await driver.advance(6000);
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'hand_show' }]);
  driver.send(cue('hand_right'));
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  driver.stop();
});

test('a lost hand stops directing and says so once', async () => {
  const driver = await guiding();
  const before = driver.parts.length;
  driver.send({ type: 'GUIDE_LOST' });
  await driver.flush();
  assert.equal(driver.guide(), 'handLost');
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'hand_lost' }]);
  await driver.advance(12000);
  assert.equal(driver.parts.length, before + 1);
  driver.send(cue('hand_right'));
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  driver.stop();
});

test('a wrong product hears no, what it is, put it back and the way', async () => {
  const driver = await guiding();
  driver.send({ type: 'GUIDE_WRONG', label: 'Guedila water', cue: 'hand_right' });
  await driver.flush();
  assert.equal(driver.guide(), 'wrongItem');
  assert.deepEqual(driver.parts.at(-1), [
    { clip: 'no' },
    { text: 'This is Guedila water.' },
    { clip: 'put_back' },
    { text: 'Masaad water is to your right.' },
    { clip: 'hand_right' },
  ]);
  await driver.advance(6000);
  assert.deepEqual(driver.parts.at(-1), [
    { clip: 'no' },
    { text: 'This is Guedila water.' },
    { clip: 'put_back' },
    { text: 'Masaad water is to your right.' },
    { clip: 'hand_right' },
  ]);
  driver.send(cue('hand_right'));
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  driver.stop();
});

test('a lost target says the way to turn the phone', async () => {
  const driver = await guiding();
  driver.send({ type: 'GUIDE_TARGET_LOST', cue: 'phone_left_small' });
  await driver.flush();
  assert.equal(driver.guide(), 'targetLost');
  assert.deepEqual(driver.parts.at(-1), [{ text: 'Masaad water is out of view.' }, { clip: 'phone_left_small' }]);
  const repeats = driver.parts.length;
  await driver.advance(6000);
  assert.equal(driver.parts.length, repeats + 1);
  driver.send(cue('hand_right'));
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  driver.stop();
});

test('drifting back out of reach returns to almost there', async () => {
  const driver = await guiding();
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 680, y: 520 } });
  await driver.flush();
  assert.equal(driver.guide(), 'reaching');
  driver.send({ type: 'GUIDE_ALIGNED', proximity: 0.9, hand: { x: 595, y: 520 } });
  await driver.flush();
  assert.equal(driver.guide(), 'almost');
  driver.stop();
});

test('saying got it picks up from reach forward, nowhere else', async () => {
  const driver = await guiding();
  driver.setUnderstand(() => answer({ intent: 'got_it' }));
  await driver.heard('got it');
  assert.equal(driver.guide(), 'directing');
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 680, y: 520 } });
  await driver.flush();
  await driver.heard('got it');
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'pick_up' }, { clip: 'checking' }]);
  assert.equal(driver.guide(), 'idle');
  driver.stop();
});

test('saying guide me returns to directing from a wrong product', async () => {
  const driver = await guiding();
  driver.send({ type: 'GUIDE_WRONG', label: 'Guedila water', cue: 'hand_right' });
  await driver.flush();
  driver.setUnderstand(() => answer({ intent: 'guide_me' }));
  await driver.heard('guide me');
  assert.equal(driver.guide(), 'directing');
  driver.stop();
});

test('stopping ends guiding and clears the target', async () => {
  const driver = await guiding();
  driver.setUnderstand(() => answer({ intent: 'stop' }));
  await driver.heard('stop');
  assert.equal(driver.guide(), 'idle');
  assert.equal(driver.context().guiding, false);
  assert.equal(driver.context().guideTarget, null);
  driver.stop();
});

test('a pause drops the target, resume says one line and looks fresh', async () => {
  const driver = await guiding();
  const said = driver.spoken.length;
  const sounded = driver.parts.length;
  driver.send({ type: 'PAUSE' });
  await driver.flush();
  assert.equal(driver.context().guiding, false);
  assert.equal(driver.context().guideTarget, null);
  assert.equal(driver.context().shelfTarget, null);
  driver.send({ type: 'RESUME' });
  await driver.flush();
  assert.equal(driver.talk(), 'listening');
  assert.equal(driver.spoken.length, said + 1);
  assert.ok(driver.spoken.at(-1)?.includes('Welcome back'));
  assert.equal(driver.parts.length, sounded);
  assert.equal(driver.guide(), 'idle');
  assert.equal(driver.context().guiding, false);
  driver.send(found());
  await driver.flush();
  assert.equal(driver.guide(), 'aiming');
  assert.equal(driver.context().guiding, true);
  driver.send(cue('hand_right'));
  await driver.flush();
  assert.equal(driver.guide(), 'directing');
  driver.stop();
});

test('a hand already at the target goes straight to almost there', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  driver.send(found());
  await driver.flush();
  driver.send({ type: 'GUIDE_ALIGNED', proximity: 0.9, hand: { x: 595, y: 520 } });
  await driver.flush();
  assert.equal(driver.guide(), 'almost');
  assert.deepEqual(driver.parts.at(-1), [{ clip: 'almost' }]);
  driver.stop();
});

test('guiding waits while the talk side is busy, then aims', async () => {
  const driver = await startListening({ request: 'Masaad water' });
  let release!: (value: { intent: string }) => void;
  const gate = new Promise<{ intent: string }>((resolve) => {
    release = resolve;
  });
  driver.setUnderstand(() => gate as never);
  driver.send({ type: 'FINAL_TEXT', text: 'where is it' });
  await driver.flush();
  assert.equal(driver.talk(), 'understanding');
  driver.send(found());
  await driver.flush();
  assert.equal(driver.guide(), 'arming');
  release(answer({ intent: 'where_is_it' }));
  await driver.flush();
  await driver.advance(500);
  assert.equal(driver.guide(), 'aiming');
  driver.stop();
});

