// The cloud half of the shelf loop: new tracks read in a priority
// batch first, so the found line never waits on the rest; then the
// verdicts, the swept shelf, and the empty-shelf scenes.
import { aisleFallback, findCloseMatch, packageKind } from './match';
import { createReadQueue, dropEpoch, enqueueRead, nextRead } from './queue';
import type { ShelfRead } from '../relay';
import type { LoopDeps, LoopState } from './loopTypes';
import type { Tracked } from './shelfTracks';

export const QUIET_MS = 8000;

const EMPTY_BEFORE_TURN = 2;
const EMPTY_BEFORE_SWEPT = 3;

export interface ReadsContext {
  deps: LoopDeps;
  state: LoopState;
  stale: (epoch: number) => boolean;
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
  const answer = await deps.read(request, jobs.map((queued) => ({ id: queued.id, image: queued.image, mime: queued.mime })));
  if (ctx.stale(epoch)) {
    return [];
  }
  state.stats.readCalls += 1;
  state.stats.readCrops += jobs.length;
  deps.log(`shelf read ${answer.readMs}ms verdicts ${answer.reads.map((read) => read.verdict).join(',')}`);
  for (const entry of batch) {
    const read = answer.reads.find((item) => item.id === `shelf-${entry.track}`) ?? null;
    if (read && (entry.read === null || entry.read.verdict === 'unsure' || read.verdict !== 'unsure')) {
      entry.read = read;
    }
  }
  return answer.reads;
}

export function reportVerdicts(ctx: ReadsContext, request: string, reads: ShelfRead[], epoch: number): void {
  const { deps, state } = ctx;
  if (reads.some((read) => read.verdict === 'yes')) {
    state.fruitlessPasses = 0;
    const key = `${epoch}:${request}`;
    if (state.foundKey !== key) {
      state.foundKey = key;
      deps.send({ type: 'SHELF_FOUND', product: request });
    }
    return;
  }
  const close = findCloseMatch(request, reads);
  if (close && deps.readContext().alternative !== close) {
    state.fruitlessPasses = 0;
    deps.send({ type: 'CLOSE_MATCH', wanted: request, found: close });
  }
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
