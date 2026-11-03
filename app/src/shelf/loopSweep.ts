// The shelf loop's sweep (plan parts 4 and 5): a fruitless pass on the
// right shelf starts it when the camera's pan is known, never while the
// hand is guided to a product already found; every half second the pan
// says when to stop, and the clocks hold while a cue waits to be said;
// a stop is read from a still taken once the camera settled there, not
// a sharper one from the stop before, and an unsure label is read again;
// the end of the reach asks Muse Spark what is there instead, from the
// last still and the products read on the way. Without a pan the loop
// keeps its old turns and asks the same at its swept shelf; without an
// answer it says the shelf was checked.
import type { ReadsContext } from './loopReads';
import type { LoopPhoto, LoopState } from './loopTypes';
import type { Tracked } from './shelfTracks';
import { needsRead } from './shelfTracks';
import { idleSweep, readableSince, startSweep, sweepDone, sweepRead, sweepTick, sweeping, sweptWhole } from './sweep';
import type { SweepCue } from './sweep';
import { nameKey, readName, seenNames } from './inventory';

const SEEN_AGE_MS = 240000;
const SEEN_MAX = 12;

function sendCue(ctx: ReadsContext, cue: SweepCue): void {
  const { deps, state } = ctx;
  deps.log(`shelf sweep ${cue} step ${state.sweep.step} checked ${state.sweep.checked.size}`);
  deps.send({ type: 'SWEEP_CUE', cue, product: state.request });
}

function inView(state: LoopState): Tracked[] {
  return state.emptyOutlines > 0 ? [] : state.tracks;
}

function namesRead(tracks: Tracked[]): string[] {
  return tracks.flatMap((entry) => {
    const name = entry.read ? readName(entry.read) : null;
    const key = name ? nameKey(name) : '';
    return key.length > 0 ? [key] : [];
  });
}

/** A fruitless pass on the right shelf: true when the sweep took over. */
export function beginSweep(ctx: ReadsContext): boolean {
  const { deps, state } = ctx;
  if (state.sweep.phase !== 'idle' || state.foundTrack !== null || deps.readContext().guiding) {
    return false;
  }
  const pan = deps.pan?.() ?? null;
  if (!pan) {
    return false;
  }
  sendCue(ctx, startSweep(state.sweep, pan, deps.now(), namesRead(inView(state))));
  return true;
}

export function tickSweep(ctx: ReadsContext): void {
  const { deps, state } = ctx;
  if (!sweeping(state.sweep)) {
    return;
  }
  const cue = sweepTick(state.sweep, deps.pan?.() ?? null, deps.now(), deps.readContext().sweepPending === true);
  if (cue) {
    sendCue(ctx, cue);
  }
}

/** The stills a pass may read: at a sweep stop, only those taken once the camera settled there. */
export function stopPhotos(state: LoopState, photos: LoopPhoto[]): LoopPhoto[] {
  const since = readableSince(state.sweep);
  return since === null ? photos : photos.filter((photo) => (photo.at ?? since) >= since);
}

/** The product is not on the checked shelf: what is there instead, in Muse Spark's words, or the swept line. */
export async function sayNotHere(ctx: ReadsContext, request: string, epoch: number, checked: number, whole: boolean): Promise<void> {
  const { deps, state } = ctx;
  const still = state.lastStill;
  if (!deps.notHere || !still) {
    deps.send({ type: 'SHELF_SWEPT', checked });
    return;
  }
  try {
    const reply = await deps.notHere(request, still.image, still.mime, seenNames(deps.now(), SEEN_AGE_MS, SEEN_MAX));
    if (ctx.stale(epoch)) {
      return;
    }
    deps.log(`shelf not here ${JSON.stringify(reply)}`);
    deps.send({ type: 'NOT_HERE', wanted: request, answer: reply.answer, offer: reply.offer, checked, whole });
  } catch (error) {
    deps.log(`shelf not-here summary failed: ${String((error as Error)?.message ?? error)}`);
    if (!ctx.stale(epoch)) {
      deps.send({ type: 'SHELF_SWEPT', checked });
    }
  }
}

/** After a pass that read at a stop: a reread, the next cue, or the not-here summary at the end of the reach. */
export async function afterSweepRead(ctx: ReadsContext, request: string, epoch: number): Promise<void> {
  const { deps, state } = ctx;
  if (state.sweep.phase !== 'reading' || ctx.stale(epoch)) {
    return;
  }
  if (state.foundTrack !== null) {
    state.sweep = idleSweep();
    return;
  }
  const here = inView(state);
  const unsure = needsRead(here).length > 0;
  const cue = sweepRead(state.sweep, here.map((entry) => entry.outline), namesRead(here), unsure, deps.now());
  if (cue) {
    sendCue(ctx, cue);
  } else if (sweepDone(state.sweep)) {
    await sayNotHere(ctx, request, epoch, state.sweep.checked.size, sweptWhole(state.sweep));
  } else {
    deps.log(`shelf sweep reads step ${state.sweep.step} again, a label came back unsure`);
  }
}
