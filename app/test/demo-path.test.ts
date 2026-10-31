// The t5 demo path replayed from the phone log: the Masaad beside
// the Guedila in portrait 960x1280, the logged tips and boxes, SAM
// ids reused across passes, the box cut short under the hand, a
// pause and resume, and Arabic throughout. The hand reaches the
// Masaad, the check runs, and the green yes screen shows; out of
// view is never spoken and the first cue lands within a second.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideLoop } from '../src/guide/loop';
import type { GuideLoopDeps } from '../src/guide/loopTypes';
import type { HandFix } from '../src/guide/types';
import type { ConversationEvent, SpeechPart } from '../src/conversation/types';
import type { ShelfBox, ShelfOutline } from '../src/relay';
import { startListening } from './driver';

const W = 960;

const H = 1280;

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: W, h: H, confidence: null };
}

function outline(id: number, frame: number, pack: ShelfBox): ShelfOutline {
  return { id, frame, box: pack };
}

const MASAAD = box(161, 335, 396, 1012);

const MASAAD_CUT = box(244, 569, 467, 1012);

const GUEDILA = box(549, 279, 758, 968);

function fix(x: number, y: number, atMs: number): HandFix {
  return { x, y, confidence: 0.9, handWidth: 120, atMs };
}

function partTexts(parts: SpeechPart[][]): string[] {
  return parts.flatMap((row) => row.filter((part) => 'text' in part).map((part) => (part as { text: string }).text));
}

test('t5 replays to the green yes screen with no out-of-view loop', async () => {
  const driver = await startListening({ language: 'ar', request: 'ماء مسعد' });
  try {
    const stamped: Array<{ event: ConversationEvent; at: number }> = [];
    const logs: string[] = [];
    let now = 10000;
    const deps: GuideLoopDeps = {
      now: () => now,
      send: (event) => {
        stamped.push({ event, at: now });
        driver.send(event);
      },
      log: (line) => {
        logs.push(line);
      },
      cutCrop: async () => null,
      read: async () => ({ reads: [], readMs: 5 }),
    };
    const loop = createGuideLoop(deps);
    const tick = (ms: number): void => {
      now += ms;
    };
    async function frame(tip: HandFix | null, outlines: ShelfOutline[]): Promise<void> {
      const target = driver.context().guideTarget;
      if (target) {
        loop.syncTarget(target.box);
      }
      await loop.handFrame(tip, outlines, W, H);
      await driver.flush();
    }
    const epoch0 = [outline(7, 3, MASAAD), outline(8, 3, GUEDILA)];
    driver.send({ type: 'SHELF_OUTLINED', outlines: epoch0, kind: 'bottles' });
    driver.send({ type: 'SHELF_FOUND', product: 'ماء مسعد', outline: outline(7, 3, MASAAD), matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.equal(driver.guide(), 'aiming');
    assert.deepEqual(driver.parts[0], [{ text: 'وجدت ماء مسعد في الوسط.' }]);
    loop.setTarget(outline(7, 3, MASAAD), 'ماء مسعد');
    loop.setPhoto({ image: 'photo', mime: 'image/jpeg' });
    const approachAt = now;
    await frame(fix(530, 392, now), epoch0);
    tick(250);
    await frame(fix(530, 392, now), epoch0);
    tick(250);
    await frame(fix(530, 392, now), epoch0);
    tick(250);
    const firstCue = stamped.find((entry) => entry.event.type === 'GUIDE_CUE');
    assert.equal((firstCue?.event as { cue: string }).cue, 'hand_left_small');
    assert.ok(firstCue && firstCue.at - approachAt <= 1000);
    assert.equal(driver.guide(), 'directing');
    const epoch0b = [outline(7, 4, GUEDILA), outline(9, 4, MASAAD)];
    driver.send({ type: 'SHELF_OUTLINED', outlines: epoch0b, kind: 'bottles' });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.id, 9);
    await frame(fix(428, 392, now), epoch0b);
    tick(250);
    driver.send({ type: 'SHELF_OUTLINED', outlines: [outline(2, 5, MASAAD_CUT), outline(8, 5, GUEDILA)], kind: 'bottles' });
    await driver.flush();
    assert.equal(driver.context().guideTarget?.box.y1, 335);
    const cut = [outline(2, 5, MASAAD_CUT), outline(8, 5, GUEDILA)];
    await frame(fix(428, 392, now), cut);
    tick(250);
    await frame(fix(428, 392, now), cut);
    tick(250);
    assert.equal(driver.guide(), 'almost');
    const said = driver.spoken.length;
    driver.send({ type: 'PAUSE' });
    await driver.flush();
    driver.send({ type: 'RESUME' });
    await driver.flush();
    assert.equal(driver.talk(), 'listening');
    assert.equal(driver.spoken.length, said + 1);
    assert.ok((driver.spoken.at(-1) ?? '').includes('مسعد'));
    assert.equal(driver.context().guideTarget, null);
    assert.equal(driver.guide(), 'idle');
    loop.reset();
    const epoch1 = [outline(1, 9, MASAAD), outline(2, 9, GUEDILA)];
    driver.send({ type: 'SHELF_OUTLINED', outlines: epoch1, kind: 'bottles' });
    driver.send({ type: 'SHELF_FOUND', product: 'ماء مسعد', outline: outline(1, 9, MASAAD), matches: 1, kind: 'bottles', position: 'middle' });
    await driver.flush();
    assert.equal(driver.guide(), 'aiming');
    loop.setTarget(outline(1, 9, MASAAD), 'ماء مسعد');
    for (let step = 0; step < 9; step += 1) {
      const dx = step * 8;
      const moved = box(161 + dx, 335, 396 + dx, 1012);
      const outlines = [outline(1, 9, moved), outline(2, 9, GUEDILA)];
      driver.send({ type: 'OUTLINES_MOVED', outlines });
      await driver.flush();
      await frame(fix(280 + dx, 700, now), outlines);
      tick(150);
    }
    assert.ok(stamped.some((entry) => entry.event.type === 'GUIDE_CONTACT'));
    assert.equal(driver.guide(), 'idle');
    assert.equal(driver.confirm(), 'checking');
    const epoch = driver.context().confirmEpoch;
    driver.send({ type: 'CONFIRM_YES', epoch, label: 'ماء مسعد', crop: 'crop' });
    await driver.flush();
    assert.equal(driver.confirm(), 'yes');
    assert.equal(driver.context().confirmVerdict, 'yes');
    assert.ok(!logs.some((line) => line.includes('out of view')));
    assert.ok(!partTexts(driver.parts).some((text) => text.includes('خارج الصورة')));
  } finally {
    driver.stop();
  }
});
