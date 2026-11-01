// The cloud half of the shelf loop: new tracks read in a priority
// batch first, so the found line never waits on the rest; then the
// verdicts, the swept shelf, and the empty-shelf scenes.
import { aisleFallback, findCloseMatch, packageKind } from './match';
import { createReadQueue, dropEpoch, enqueueRead, nextRead } from './queue';
import type { ShelfBox, ShelfCrop, ShelfRead } from '../relay';
import type { LoopDeps, LoopState } from './loopTypes';
import type { Tracked } from './shelfTracks';
import { boxOverlap } from './outlines';
import { positionFor } from '../guide/steer';
import { noteSeen, readName } from './inventory';

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
  const { deps, state } = ctx;
  const target = nearestOutline(state, reads);
  if (target) {
    state.fruitlessPasses = 0;
    const key = `${epoch}:${request}`;
    if (state.foundKey !== key) {
      state.foundKey = key;
      sendFound(ctx, request, reads, epoch, target);
    }
    return;
  }
  const close = findCloseMatch(request, reads);
  if (close && deps.readContext().alternative !== close) {
    state.fruitlessPasses = 0;
    deps.send({ type: 'CLOSE_MATCH', wanted: request, found: close });
  }
}

function closestYes(state: LoopState, reads: ShelfRead[], held: ShelfBox): Tracked | null {
  const yes = new Set(reads.filter((read) => read.verdict === 'yes').map((read) => read.id.replace(/^shelf-/, '')));
  const gap = (entry: Tracked): number =>
    Math.abs(entry.outline.box.x1 + entry.outline.box.x2 - held.x1 - held.x2) + Math.abs(entry.outline.box.y1 + entry.outline.box.y2 - held.y1 - held.y2);
  return [...state.tracks.filter((entry) => yes.has(entry.track))].sort((a, b) => gap(a) - gap(b))[0] ?? null;
}

// The yes overlapping the guided box, or, when the guided spot was
// read no or the product is out of view, the yes nearest the guided
// spot: with two matching bottles the hand keeps its one (t19 jumped
// between two Guedila bottles on each recheck).
function refindTarget(ctx: ReadsContext, reads: ShelfRead[]): Tracked | null {
  const { deps, state } = ctx;
  const best = nearestOutline(state, reads);
  const context = deps.readContext();
  const held = context.guideBox ?? null;
  if (!best || !held) {
    return best;
  }
  if (context.guideLost) {
    return closestYes(state, reads, held) ?? best;
  }
  const verdict = (entry: Tracked): string | undefined => reads.find((read) => read.id === `shelf-${entry.track}`)?.verdict;
  const here = state.tracks
    .filter((entry) => boxOverlap(entry.outline.box, held) >= REFIND_IOU)
    .sort((a, b) => boxOverlap(b.outline.box, held) - boxOverlap(a.outline.box, held));
  const same = here.find((entry) => verdict(entry) === 'yes');
  if (same) {
    return same;
  }
  if (here.some((entry) => verdict(entry) === 'no')) {
    return closestYes(state, reads, held) ?? best;
  }
  deps.log(`shelf recheck kept the target, a yes at ${Math.round(best.outline.box.x1)}-${Math.round(best.outline.box.x2)} is elsewhere`);
  return null;
}

export function reportRefind(ctx: ReadsContext, request: string, reads: ShelfRead[], epoch: number): void {
  const { state } = ctx;
  const target = refindTarget(ctx, reads);
  if (target) {
    state.fruitlessPasses = 0;
    sendFound(ctx, request, reads, epoch, target);
  }
}

export function targetJumped(state: LoopState): boolean {
  if (!state.foundTrack || !state.foundOutline) {
    return false;
  }
  const entry = state.tracks.find((tracked) => tracked.track === state.foundTrack) ?? null;
  if (!entry) {
    return true;
  }
  return boxOverlap(entry.outline.box, state.foundOutline.box) < TARGET_STEADY_IOU;
}

export function maybeSwept(ctx: ReadsContext, reads: ShelfRead[], epoch: number): void {
  const { deps, state } = ctx;
  if (reads.length === 0 || !reads.every((read) => read.verdict === 'no')) {
    return;
  }
  state.fruitlessPasses += 1;
  const checked = deps.readContext().checkedCount;
  if (state.fruitlessPasses >= EMPTY_BEFORE_SWEPT && state.sweptEpoch !== epoch && checked > 0) {
    state.fruitlessPasses = 0;
    state.sweptEpoch = epoch;
    deps.send({ type: 'SHELF_SWEPT', checked });
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
  state.emptyPasses += 1;
  if (state.classifyAt !== null && deps.now() - state.classifyAt < QUIET_MS) {
    return;
  }
  state.classifyAt = deps.now();
  const scene = await deps.classify(request, image, 'image/jpeg');
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
  if (!scene.kinds.includes(kind) && !scene.kinds.includes(phrase.trim())) {
    if (state.lastScene !== key) {
      state.lastScene = key;
      deps.send({ type: 'WRONG_SHELF', kind, aisle: scene.aisle_hint ?? aisleFallback(context.lang) });
    }
    return;
  }
  if (state.emptyPasses >= EMPTY_BEFORE_TURN) {
    state.emptyPasses = 0;
    const direction = state.turnRightNext ? 'right' : 'left';
    state.turnRightNext = !state.turnRightNext;
    deps.send({ type: 'SHELF_TURN', direction });
  }
}
