// A recheck while guiding stays on the guided product. t10: the hand
// hid the Guedila, SAM outlined the Masaad and a reflection beside
// the Guedila, the read said no,yes, and the guide jumped to the
// reflection. A yes elsewhere moves the target only when the guided
// spot was read no or the product is out of view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfLoop } from '../src/shelf/loop';
import type { LoopDeps, LoopPhoto } from '../src/shelf/loopTypes';
import type { ShelfBox, ShelfOutline, ShelfRead } from '../src/relay';
import type { ConversationEvent } from '../src/conversation/types';

function box(x1: number, y1: number, x2: number, y2: number): ShelfBox {
  return { x1, y1, x2, y2, w: 960, h: 1280, confidence: null };
}

const GUEDILA = box(462, 317, 699, 1103);
const MASAAD = box(161, 335, 396, 1180);
const REFLECTION = box(765, 217, 959, 1017);

function photo(): LoopPhoto {
  return { image: 'frame', mime: 'image/jpeg', w: 960, h: 1280, grey: { data: new Uint8Array(0), w: 0, h: 0 } };
}

async function recheck(
  outlines: Array<{ box: ShelfBox; verdict: ShelfRead['verdict'] }>,
  guideLost = false,
): Promise<{ found: ShelfOutline[]; logs: string[] }> {
  const sent: ConversationEvent[] = [];
  const logs: string[] = [];
  let guiding = false;
  const verdicts = new Map<string, ShelfRead['verdict']>();
  const deps: LoopDeps = {
    now: () => 0,
    outline: async () => ({ outlines: outlines.map((entry, at) => ({ id: at + 1, frame: 0, box: entry.box })), samMs: 5, maskMs: 1 }),
    fetchPhrase: async () => 'bottle',
    read: async (_request, crops) => ({
      reads: crops.map((crop) => ({ id: crop.id, brand_text: null, size_text: null, verdict: verdicts.get(crop.id) ?? 'no', spoken: '' })),
      readMs: 7,
    }),
    classify: async () => ({ scene: 'shelf', kinds: ['bottles'], aisle_hint: null }),
    cutCrops: async (_image, tracks) =>
      tracks.map((entry) => {
        const id = `shelf-${entry.track}`;
        verdicts.set(id, outlines.find((pack) => pack.box.x1 === entry.outline.box.x1)?.verdict ?? 'no');
        return { id, image: 'crop', mime: 'image/jpeg' };
      }),
    readContext: () => ({ lang: 'ar', alternative: null, checkedCount: 2, guiding, guideLost, guideRecheck: guiding, guideBox: guiding ? GUEDILA : null }),
    send: (event) => {
      sent.push(event);
    },
    log: (line) => {
      logs.push(line);
    },
  };
  const loop = createShelfLoop(deps);
  loop.setTarget('قديلة', 1);
  guiding = true;
  await loop.cloudPass([photo()]);
  const found = sent.filter((event) => event.type === 'SHELF_FOUND').map((event) => (event as { outline: ShelfOutline }).outline);
  return { found, logs };
}

test('t10: a yes on a reflection beside the hidden product keeps the target', async () => {
  const { found, logs } = await recheck([
    { box: MASAAD, verdict: 'no' },
    { box: REFLECTION, verdict: 'yes' },
  ]);
  assert.equal(found.length, 0);
  assert.ok(logs.includes('shelf recheck kept the target, a yes at 765-959 is elsewhere'));
});

test('a yes on the guided product is re-adopted', async () => {
  const shifted = box(470, 320, 705, 1100);
  const { found } = await recheck([
    { box: MASAAD, verdict: 'no' },
    { box: REFLECTION, verdict: 'yes' },
    { box: shifted, verdict: 'yes' },
  ]);
  assert.ok(found.length >= 1);
  assert.ok(found.every((outline) => outline.box.x1 === 470));
});

test('the guided spot read no moves the target to the yes', async () => {
  const { found } = await recheck([
    { box: GUEDILA, verdict: 'no' },
    { box: REFLECTION, verdict: 'yes' },
  ]);
  assert.equal(found[0]?.box.x1, 765);
});

test('a product out of view is found again anywhere', async () => {
  const { found } = await recheck([{ box: REFLECTION, verdict: 'yes' }], true);
  assert.equal(found[0]?.box.x1, 765);
});

test('t11: a reflection overlapping the guided bottle by 0.2 does not take the target', async () => {
  const { found, logs } = await recheck([
    { box: MASAAD, verdict: 'no' },
    { box: box(604, 280, 820, 1062), verdict: 'yes' },
  ]);
  assert.equal(found.length, 0);
  assert.ok(logs.includes('shelf recheck kept the target, a yes at 604-820 is elsewhere'));
});
