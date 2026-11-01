// The shelf loop's sweep (plan parts 4 and 5): a fruitless pass on the
// right shelf starts it when the camera's pan is known; every half
// second the pan says when to stop; each stop gets one read; the end
// of the reach asks Muse Spark what is there instead, from the last
// still and the products read on the way. Without a pan the loop keeps
// its old turns and asks the same at its swept shelf; without an
// answer it says the shelf was checked.
import type { ReadsContext } from './loopReads';
import { idleSweep, startSweep, sweepDone, sweepRead, sweepTick } from './sweep';
import type { SweepCue } from './sweep';
import { seenNames } from './inventory';

const SEEN_AGE_MS = 240000;
const SEEN_MAX = 12;

function sendCue(ctx: ReadsContext, cue: SweepCue): void {
  const { deps, state } = ctx;
  deps.log(`shelf sweep ${cue} step ${state.sweep.step} checked ${state.sweep.checked}`);
  deps.send({ type: 'SWEEP_CUE', cue, product: state.request });
}

/** A fruitless pass on the right shelf: true when the sweep took over. */
export function beginSweep(ctx: ReadsContext): boolean {
  const { deps, state } = ctx;
  const pan = state.sweep.phase === 'idle' ? (deps.pan?.() ?? null) : null;
  if (!pan) {
    return false;
  }
  sendCue(ctx, startSweep(state.sweep, pan, deps.now()));
  return true;
}

export function tickSweep(ctx: ReadsContext): void {
  const { deps, state } = ctx;
  const cue = sweepTick(state.sweep, deps.pan?.() ?? null, deps.now());
  if (cue) {
    sendCue(ctx, cue);
  }
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

/** After a pass that read at a stop: the next cue, or the not-here summary at the end of the reach. */
export async function afterSweepRead(ctx: ReadsContext, request: string, epoch: number): Promise<void> {
  const { deps, state } = ctx;
  if (state.sweep.phase !== 'reading' || ctx.stale(epoch)) {
    return;
  }
  if (state.foundTrack !== null) {
    state.sweep = idleSweep();
    return;
  }
  const inView = state.emptyOutlines > 0 ? [] : state.tracks;
  const cue = sweepRead(state.sweep, inView.map((entry) => entry.outline), inView.length, deps.now());
  if (cue) {
    sendCue(ctx, cue);
  } else if (sweepDone(state.sweep)) {
    await sayNotHere(ctx, request, epoch, state.sweep.checked, true);
  }
}
