// Blurry frames never burn a label read: the loop waits for a
// sharper frame, reads anyway after two waits, and always reads
// an unscored frame rather than blocking on missing data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { LoopDeps, LoopPhoto, ShelfLoop } from '../src/shelf/loopTypes';
import type { ShelfBox, ShelfOutline, ShelfRead } from '../src/relay';

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: 112, h: 96, confidence: null };
}

function greyOf(kind: 'flat' | 'checker'): { data: Uint8Array; w: number; h: number } {
  const w = 8;
  const h = 8;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      data[y * w + x] = kind === 'flat' ? 128 : (x + y) % 2 === 0 ? 0 : 255;
    }
  }
  return { data, w, h };
}

function photo(kind: 'flat' | 'checker' | 'unscored'): LoopPhoto {
  const grey = kind === 'unscored' ? { data: new Uint8Array(0), w: 0, h: 0 } : greyOf(kind);
  return { image: 'frame', mime: 'image/jpeg', w: 112, h: 96, grey };
}

function harness(): { loop: ShelfLoop; calls: { outline: number; read: number }; logs: string[] } {
  const calls = { outline: 0, read: 0 };
  const logs: string[] = [];
  const deps: LoopDeps = {
    now: () => 0,
    outline: async () => {
      calls.outline += 1;
      const pack = box(8, 8, 40, 40);
      const outlines: ShelfOutline[] = [{ id: 0, frame: 0, box: pack }];
      return { outlines, samMs: 5, maskMs: 1 };
    },
    fetchPhrase: async () => 'rice bag',
    read: async () => {
      calls.read += 1;
      const reads: ShelfRead[] = [{ id: 'shelf-t1', brand_text: 'x', size_text: null, verdict: 'yes', spoken: 'x' }];
      return { reads, readMs: 7 };
    },
    classify: async () => ({ scene: 'shelf', kinds: ['bags'], aisle_hint: null }),
    cutCrops: async (_image, tracks) => tracks.map((entry) => ({ id: `shelf-${entry.track}`, image: 'crop', mime: 'image/jpeg' })),
    readContext: () => ({ lang: 'en', alternative: null, checkedCount: 2 }),
    send: () => undefined,
    log: (line: string) => {
      logs.push(line);
    },
  };
  return { loop: createShelfLoop(deps), calls, logs };
}

test('a blurry frame waits for a sharper one instead of reading', async () => {
  const rig = harness();
  rig.loop.setTarget('rice', 1);
  await rig.loop.cloudPass([photo('flat')]);
  assert.equal(rig.calls.outline, 0);
  assert.equal(rig.calls.read, 0);
  assert.ok(rig.logs.some((line) => line.includes('too blurry')));
  await rig.loop.cloudPass([photo('checker')]);
  assert.equal(rig.calls.outline, 1);
  assert.equal(rig.calls.read, 1);
});

test('two blurry waits then reads anyway', async () => {
  const rig = harness();
  rig.loop.setTarget('rice', 1);
  await rig.loop.cloudPass([photo('flat')]);
  await rig.loop.cloudPass([photo('flat')]);
  assert.equal(rig.calls.outline, 0);
  await rig.loop.cloudPass([photo('flat')]);
  assert.equal(rig.calls.outline, 1);
  assert.equal(rig.calls.read, 1);
});

test('an unscored frame always reads', async () => {
  const rig = harness();
  rig.loop.setTarget('rice', 1);
  await rig.loop.cloudPass([photo('unscored')]);
  assert.equal(rig.calls.outline, 1);
  assert.equal(rig.calls.read, 1);
});
