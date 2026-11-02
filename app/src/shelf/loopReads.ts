// The cloud half of the shelf loop: new tracks read in a priority
// batch first, so the found line never waits on the rest; then the
// verdicts, the swept shelf, and the empty-shelf scenes. While the hand
// is guided an empty pass asks no scene: its lines would wait out the
// guide and then send the shopper elsewhere.
import { packageKind } from './match';
import { createReadQueue, dropEpoch, enqueueRead, nextRead } from './queue';
import type { ShelfBox, ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import type { LoopDeps, LoopState } from './loopTypes';
import type { Tracked } from './shelfTracks';
import { boxOverlap } from './outlines';
import { positionFor } from '../guide/steer';
import { noteSeen, readName } from './inventory';
import { beginSweep, sayNotHere } from './loopSweep';
import { sweeping } from './sweep';
import { placer } from './place';

export const QUIET_MS = 8000;

const TARGET_STEADY_IOU = 0.5;

// A recheck re-finds the guided product where it is: a yes must
// overlap the box the hand is going to. In t10 SAM outlined a
// reflection beside the Guedila while the hand hid the real one, the
// read called the reflection yes, and the guide jumped to it; in t11 a
// reflection overlapping the Guedila by 0.2 took the target, so the
// overlap must be clear.
const REFIND_IOU = 0.4;

const EMPTY_BEFORE_TURN = 2;
const EMPTY_BEFORE_SWEPT = 3;

export interface ReadsContext {
  deps: LoopDeps;
  state: LoopState;
  stale: (epoch: number) => boolean;
}

// The relay reads one to eight crops per call (relay/src/shelf.ts).
export const READ_MAX = 8;

/** Reads crops in calls of at most eight, side by side (t16: eleven honey jars got a 400). */
export async function readCrops(
  deps: LoopDeps,
  request: string,
  crops: ShelfCrop[],
): Promise<{ reads: ShelfRead[]; readMs: number; calls: number }> {
  const chunks: ShelfCrop[][] = [];
  for (let at = 0; at < crops.length; at += READ_MAX) {
    chunks.push(crops.slice(at, at + READ_MAX));
  }
  const answers = await Promise.all(chunks.map((chunk) => deps.read(request, chunk)));
  return {
    reads: answers.flatMap((answer) => answer.reads),
    readMs: Math.max(0, ...answers.map((answer) => answer.readMs)),
    calls: answers.length,
  };
}

/** Asks the phrase from a blurry frame while a sharp one is awaited, so the next pass need not wait for it. */
export function prefetchPhrase(ctx: ReadsContext, request: string, photo: { image: string; mime: string }): void {
  const { deps, state } = ctx;
  if (state.phrases.has(request) || state.phraseWait) {
    return;
  }
  state.phraseWait = deps.fetchPhrase(request, photo.image, photo.mime).then((found) => {
    state.phrases.set(request, found);
    return found;
  });
  state.phraseWait.catch(() => {
    state.phraseWait = null;
  });
}

export async function readBatch(
  ctx: ReadsContext,
  request: string,
  epoch: number,
  image: string,
  batch: Tracked[],
): Promise<ShelfRead[]> {
  const { deps, state } = ctx;
  const queue = createReadQueue();
  const cuts = await deps.cutCrops(
    image,
    batch.map((entry) => ({ track: entry.track, outline: entry.outline })),
  );
  for (const crop of cuts) {
    enqueueRead(queue, { ...crop, hand: false, epoch });
    state.crops.set(crop.id.replace(/^shelf-/, ''), `data:${crop.mime};base64,${crop.image}`);
  }
  dropEpoch(queue, epoch);
  const jobs = [];
  let job = nextRead(queue);
  while (job) {
    jobs.push(job);
    job = nextRead(queue);
  }
  if (jobs.length === 0) {
    return [];
  }
  const answer = await readCrops(deps, request, jobs.map((queued) => ({ id: queued.id, image: queued.image, mime: queued.mime })));
  if (ctx.stale(epoch)) {
    return [];
  }
  state.stats.readCalls += answer.calls;
  state.stats.readCrops += jobs.length;
  state.readAt = deps.now();
  deps.log(`shelf read ${answer.readMs}ms verdicts ${answer.reads.map((read) => read.verdict).join(',')}`);
  const pan = deps.pan?.() ?? null;
  for (const entry of batch) {
    const read = answer.reads.find((item) => item.id === `shelf-${entry.track}`) ?? null;
    if (read && (entry.read === null || entry.read.verdict === 'unsure' || read.verdict !== 'unsure')) {
      entry.read = read;
    }
    const name = read ? readName(read) : null;
    if (name) {
      noteSeen(name, entry.outline.box, pan, deps.now());
    }
  }
  return answer.reads;
}

function nearestOutline(state: LoopState, reads: ShelfRead[]): Tracked | null {
  const yes = new Set(reads.filter((read) => read.verdict === 'yes').map((read) => read.id.replace(/^shelf-/, '')));
  if (yes.size === 0) {
    return null;
  }
  const outlines = state.tracks.filter((entry) => yes.has(entry.track));
  const area = (entry: Tracked): number => Math.max(0, entry.outline.box.x2 - entry.outline.box.x1) * Math.max(0, entry.outline.box.y2 - entry.outline.box.y1);
  const central = (entry: Tracked): number =>
    entry.outline.box.w > 0 ? Math.abs((entry.outline.box.x1 + entry.outline.box.x2) / 2 / entry.outline.box.w - 0.5) : 1;
  return [...outlines].sort((a, b) => area(b) - area(a) || central(a) - central(b))[0] ?? null;
}

function sendFound(ctx: ReadsContext, request: string, reads: ShelfRead[], epoch: number, tracked: Tracked): void {
  const { deps, state } = ctx;
  state.foundTrack = tracked.track;
  state.foundOutline = tracked.outline;
  const phrase = state.phrases.get(request) ?? request;
  deps.send({
    type: 'SHELF_FOUND',
    product: request,
    outline: tracked.outline,
    matches: reads.filter((read) => read.verdict === 'yes').length,
    kind: packageKind(phrase, deps.readContext().lang),
    position: positionFor(tracked.outline.box, tracked.outline.box.w),
    crop: state.crops.get(tracked.track) ?? null,
  });
}

export function reportVerdicts(ctx: ReadsContext, request: string, reads: ShelfRead[], epoch: number): void {
  const { state } = ctx;
  const target = nearestOutline(state, reads);
  if (target) {
    state.fruitlessPasses = 0;
    const key = `${epoch}:${request}`;
    if (state.foundKey !== key) {
      state.foundKey = key;
      sendFound(ctx, request, reads, epoch, target);
    }
  }
}

function closestYes(state: LoopState, reads: ShelfRead[], held: ShelfBox, place: (outline: ShelfOutline) => ShelfBox): Tracked | null {
  const yes = new Set(reads.filter((read) => read.verdict === 'yes').map((read) => read.id.replace(/^shelf-/, '')));
  const gap = (entry: Tracked): number => {
    const box = place(entry.outline);
    return Math.abs(box.x1 + box.x2 - held.x1 - held.x2) + Math.abs(box.y1 + box.y2 - held.y1 - held.y2);
  };
  return [...state.tracks.filter((entry) => yes.has(entry.track))].sort((a, b) => gap(a) - gap(b))[0] ?? null;
}

// The yes overlapping the guided box, or, when the guided spot was
// read no, the product is out of view, or a re-cut found nothing there
// (the outline had drifted, t33), the yes nearest the guided spot:
// with two matching bottles the hand keeps its one (t19 jumped between
// two Guedila bottles on each recheck). Each bottle is matched where
// the camera has it now, as the drawn outline is (t34).
function refindTarget(ctx: ReadsContext, reads: ShelfRead[], reanchor: boolean): Tracked | null {
  const { deps, state } = ctx;
  const best = nearestOutline(state, reads);
  const context = deps.readContext();
  const held = context.guideBox ?? null;
  if (!best || !held) {
    return best;
  }
  const place = placer(deps);
  if (context.guideLost) {
    return closestYes(state, reads, held, place) ?? best;
  }
  const verdict = (entry: Tracked): string | undefined => reads.find((read) => read.id === `shelf-${entry.track}`)?.verdict;
  const here = state.tracks
    .filter((entry) => boxOverlap(place(entry.outline), held) >= REFIND_IOU)
    .sort((a, b) => boxOverlap(place(b.outline), held) - boxOverlap(place(a.outline), held));
  const same = here.find((entry) => verdict(entry) === 'yes');
  if (same) {
    return same;
  }
  if (here.some((entry) => verdict(entry) === 'no')) {
    return closestYes(state, reads, held, place) ?? best;
  }
  const nearest = reanchor && here.length === 0 ? closestYes(state, reads, held, place) : null;
  if (nearest) {
    deps.log(`shelf re-cut found nothing where the outline was, the yes at ${Math.round(nearest.outline.box.x1)}-${Math.round(nearest.outline.box.x2)} takes it`);
    return nearest;
  }
  deps.log(`shelf recheck kept the target, a yes at ${Math.round(best.outline.box.x1)}-${Math.round(best.outline.box.x2)} is elsewhere`);
  return null;
}

export function reportRefind(ctx: ReadsContext, request: string, reads: ShelfRead[], epoch: number, reanchor = false): void {
  const { state } = ctx;
  const target = refindTarget(ctx, reads, reanchor);
  if (target) {
    state.fruitlessPasses = 0;
    sendFound(ctx, request, reads, epoch, target);
  }
}

export function targetJumped(state: LoopState, place: (outline: ShelfOutline) => ShelfBox = (outline) => outline.box): boolean {
  if (!state.foundTrack || !state.foundOutline) {
    return false;
  }
  const entry = state.tracks.find((tracked) => tracked.track === state.foundTrack) ?? null;
  if (!entry) {
    return true;
  }
  return boxOverlap(place(entry.outline), place(state.foundOutline)) < TARGET_STEADY_IOU;
}

export async function maybeSwept(ctx: ReadsContext, request: string, reads: ShelfRead[], epoch: number): Promise<void> {
  const { deps, state } = ctx;
  if (reads.length === 0 || !reads.every((read) => read.verdict === 'no')) {
    return;
  }
  if (beginSweep(ctx) || state.sweep.phase !== 'idle') {
    return;
  }
  state.fruitlessPasses += 1;
  const checked = deps.readContext().checkedCount;
  if (state.fruitlessPasses >= EMPTY_BEFORE_SWEPT && state.sweptEpoch !== epoch && checked > 0) {
    state.fruitlessPasses = 0;
    state.sweptEpoch = epoch;
    await sayNotHere(ctx, request, epoch, checked, false);
  }
}

export async function reportEmpty(
  ctx: ReadsContext,
  request: string,
  epoch: number,
  image: string,
  phrase: string,
): Promise<void> {
  const { deps, state } = ctx;
  if (deps.readContext().guiding) {
    return;
  }
  state.emptyPasses += 1;
  if (state.classifyAt !== null && deps.now() - state.classifyAt < QUIET_MS) {
    return;
  }
  state.classifyAt = deps.now();
  const scene = await deps.classify(request, image, 'image/jpeg', deps.readContext().lang);
  if (ctx.stale(epoch)) {
    return;
  }
  state.stats.classifyCalls += 1;
  const context = deps.readContext();
  const key = `${scene.scene}:${scene.kinds.join(',')}`;
  if (scene.scene !== 'shelf') {
    if (state.lastScene !== key) {
      state.lastScene = key;
      deps.send({ type: 'NO_SHELF', floor: scene.scene === 'floor' });
    }
    return;
  }
  const kind = packageKind(phrase, context.lang);
  const fits = scene.fits_request ?? (scene.kinds.includes(kind) || scene.kinds.includes(phrase.trim()));
  if (!fits) {
    if (state.lastScene !== key && !sweeping(state.sweep)) {
      state.lastScene = key;
      deps.send({ type: 'WRONG_SHELF', shelf: scene.shelf_label?.trim() || null, product: request });
    }
    return;
  }
  if (beginSweep(ctx) || state.sweep.phase !== 'idle') {
    return;
  }
  if (state.emptyPasses >= EMPTY_BEFORE_TURN) {
    state.emptyPasses = 0;
    const direction = state.turnRightNext ? 'right' : 'left';
    state.turnRightNext = !state.turnRightNext;
    deps.send({ type: 'SHELF_TURN', direction });
  }
}
