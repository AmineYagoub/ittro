// The sweep with memory (shelf-awareness plan part 4), replacing the
// alternating "turn right, turn left": when the product is not in view,
// Ittro walks the camera along the shelf's stops (sweepPath.ts) and
// reads at each. The camera's own pan (frame units since it opened)
// says how far it turned; a new camera opening starts again. Turning faster than half a frame a
// second asks for slower. Going past a stop counts as reaching it, and
// a stop the camera already passed is skipped, so no place is read
// twice. A cue that moved nothing is said once more, a turn the wrong
// way hears the cue again, and a stop never reached is read where the
// camera is after 15 s, so the sweep never stalls; such a stop keeps
// the sweep from claiming the whole shelf, and two in a row that never
// budged end it. While a cue waits in the conversation's queue the
// sweep's clocks hold, since the shopper has not heard it yet. A stop
// is read once the camera settled, 1.5 s after "stop", and an unsure
// label there is read up to twice more. After the full reach, a shelf
// that runs on past an end sends the shopper two steps that way, at
// most twice, and never back the way they came. Each product read
// counts once, by name, from the starting spot on.
import type { CameraPan } from './loopTypes';
import { ORIGIN, STEPS, cueFor, offsetFrom, passed, progress, stepTarget } from './sweepPath';
import type { Offset } from './sweepPath';

export type SweepCue = 'start' | 'right' | 'left' | 'down' | 'stop' | 'slower' | 'walkRight' | 'walkLeft';

export type SweepPhase = 'idle' | 'moving' | 'reading' | 'walking' | 'done';

export interface SweepState {
  phase: SweepPhase;
  step: number;
  origin: Offset;
  session: number | null;
  /** Where the camera pointed when the current step's cue was heard, and when. */
  begun: Offset;
  movedAt: number;
  /** When the current step's cue was last said, so a correction waits a moment. */
  cuedAt: number;
  repeated: boolean;
  last: { offset: Offset; at: number } | null;
  slowerAt: number;
  /** From when a still may be read at this stop: the camera settled after "stop". */
  readyAt: number;
  /** Reads again at this stop for a label that came back unsure. */
  rereads: number;
  walkedAt: number;
  walks: number;
  /** The way the first walk went: later walks only go on that way. */
  walkDir: 'right' | 'left' | null;
  edgeLeft: boolean;
  edgeRight: boolean;
  /** Stops read where the camera was given up on: the sweep then cannot claim the whole shelf. */
  missed: number;
  /** Given-up stops in a row where the camera never budged. */
  stuck: number;
  /** The products read at the starting spot and the stops, by name. */
  checked: Set<string>;
}

type EdgeOutline = { box: { x1: number; x2: number; w: number } };

const FAST_PER_S = 0.5;
const SLOWER_GAP_MS = 3000;
const REPEAT_MS = 5000;
const WRONG_GAP_MS = 3000;
const BUDGED = 0.15;
const GIVE_UP_MS = 15000;
const STUCK_MAX = 2;
const SETTLE_MS = 1500;
const REREADS_MAX = 2;
const WALK_WAIT_MS = 9000;
const WALKS_MAX = 2;
const EDGE = 0.04;

export function idleSweep(): SweepState {
  return {
    phase: 'idle',
    step: 0,
    origin: { x: 0, y: 0 },
    session: null,
    begun: { x: 0, y: 0 },
    movedAt: 0,
    cuedAt: 0,
    repeated: false,
    last: null,
    slowerAt: Number.NEGATIVE_INFINITY,
    readyAt: 0,
    rereads: 0,
    walkedAt: 0,
    walks: 0,
    walkDir: null,
    edgeLeft: false,
    edgeRight: false,
    missed: 0,
    stuck: 0,
    checked: new Set(),
  };
}

function restartAt(sweep: SweepState, pan: CameraPan, now: number, step: number): void {
  sweep.origin = { x: pan.x, y: pan.y };
  sweep.session = pan.session ?? null;
  sweep.step = step;
  sweep.begun = { x: 0, y: 0 };
  sweep.movedAt = now;
  sweep.cuedAt = now;
  sweep.repeated = false;
  sweep.last = { offset: { x: 0, y: 0 }, at: now };
  sweep.rereads = 0;
  sweep.stuck = 0;
  sweep.edgeLeft = false;
  sweep.edgeRight = false;
  sweep.phase = 'moving';
}

/** The product is not in view here: the sweep starts from where the camera points, with the products this spot read. */
export function startSweep(sweep: SweepState, pan: CameraPan, now: number, seen: string[]): SweepCue {
  restartAt(sweep, pan, now, 0);
  sweep.walks = 0;
  sweep.walkDir = null;
  sweep.missed = 0;
  sweep.checked = new Set(seen);
  return 'start';
}

function walkTick(sweep: SweepState, pan: CameraPan, now: number, held: boolean): null {
  if (held) {
    sweep.walkedAt = now;
  } else if (now - sweep.walkedAt >= WALK_WAIT_MS) {
    restartAt(sweep, pan, now, -1);
    sweep.phase = 'reading';
    sweep.readyAt = now;
  }
  return null;
}

function moveTick(sweep: SweepState, offset: Offset, last: SweepState['last'], now: number, held: boolean): SweepCue | null {
  const moved = Math.hypot(offset.x - sweep.begun.x, offset.y - sweep.begun.y);
  const reached = passed(sweep.step, offset);
  if (reached || (!held && now - sweep.movedAt >= GIVE_UP_MS)) {
    sweep.missed += reached ? 0 : 1;
    sweep.stuck = reached || moved >= BUDGED ? 0 : sweep.stuck + 1;
    sweep.phase = 'reading';
    sweep.readyAt = now + SETTLE_MS;
    return 'stop';
  }
  if (held) {
    sweep.begun = offset;
    sweep.movedAt = now;
    sweep.cuedAt = now;
    return null;
  }
  if (progress(sweep.step, sweep.begun, offset) < -BUDGED && now - sweep.cuedAt >= WRONG_GAP_MS) {
    sweep.cuedAt = now;
    return cueFor(sweep.step, offset);
  }
  if (!sweep.repeated && now - sweep.movedAt >= REPEAT_MS && moved < BUDGED) {
    sweep.repeated = true;
    sweep.cuedAt = now;
    return cueFor(sweep.step, offset);
  }
  if (last && now > last.at) {
    const speed = Math.hypot(offset.x - last.offset.x, offset.y - last.offset.y) / ((now - last.at) / 1000);
    if (speed > FAST_PER_S && now - sweep.slowerAt >= SLOWER_GAP_MS) {
      sweep.slowerAt = now;
      return 'slower';
    }
  }
  return null;
}

/** Every half second while sweeping: what to say as the camera turns, if anything; held while a cue still waits to be said. */
export function sweepTick(sweep: SweepState, pan: CameraPan | null, now: number, held = false): SweepCue | null {
  if (!pan || !sweeping(sweep)) {
    return null;
  }
  if (sweep.phase === 'walking') {
    return walkTick(sweep, pan, now, held);
  }
  if (sweep.session !== null && pan.session !== undefined && pan.session !== sweep.session) {
    restartAt(sweep, pan, now, 0);
    return cueFor(0, ORIGIN);
  }
  const offset = offsetFrom(sweep.origin, pan);
  const last = sweep.last;
  sweep.last = { offset, at: now };
  if (sweep.phase === 'moving') {
    return moveTick(sweep, offset, last, now, held);
  }
  if (held) {
    sweep.readyAt = Math.max(sweep.readyAt, now + SETTLE_MS);
  }
  return null;
}

function noteEdges(sweep: SweepState, target: Offset, outlines: EdgeOutline[]): void {
  if (target.x >= 1.2) {
    sweep.edgeRight = outlines.some((outline) => outline.box.x2 >= outline.box.w * (1 - EDGE));
  }
  if (target.x <= -1.2 && target.y === 0) {
    sweep.edgeLeft = outlines.some((outline) => outline.box.x1 <= outline.box.w * EDGE);
  }
}

function walkOn(sweep: SweepState, now: number): SweepCue | null {
  const way = sweep.walkDir ?? (sweep.edgeRight ? 'right' : sweep.edgeLeft ? 'left' : null);
  const runsOn = way === 'right' ? sweep.edgeRight : way === 'left' && sweep.edgeLeft;
  if (way === null || !runsOn || sweep.walks >= WALKS_MAX) {
    sweep.phase = 'done';
    return null;
  }
  sweep.walks += 1;
  sweep.walkDir = way;
  sweep.phase = 'walking';
  sweep.walkedAt = now;
  return way === 'right' ? 'walkRight' : 'walkLeft';
}

/** The read at a stop found nothing: null to read an unsure label again, else the next cue, a walk, or null with the reach done. */
export function sweepRead(sweep: SweepState, outlines: EdgeOutline[], seen: string[], unsure: boolean, now: number): SweepCue | null {
  for (const name of seen) {
    sweep.checked.add(name);
  }
  if (unsure && sweep.rereads < REREADS_MAX) {
    sweep.rereads += 1;
    sweep.readyAt = now;
    return null;
  }
  sweep.rereads = 0;
  const here = sweep.last?.offset ?? stepTarget(sweep.step);
  do {
    noteEdges(sweep, stepTarget(sweep.step), outlines);
    sweep.step += 1;
  } while (sweep.step < STEPS.length && passed(sweep.step, here));
  if (sweep.stuck >= STUCK_MAX) {
    sweep.phase = 'done';
    return null;
  }
  if (sweep.step >= STEPS.length) {
    return walkOn(sweep, now);
  }
  sweep.phase = 'moving';
  sweep.begun = here;
  sweep.movedAt = now;
  sweep.cuedAt = now;
  sweep.repeated = false;
  return cueFor(sweep.step, here);
}

/** Whether a cloud pass may run now: never while the camera turns, at a stop once it settled; null leaves it to the loop. */
export function sweepDue(sweep: SweepState, now: number): boolean | null {
  if (sweep.phase === 'moving' || sweep.phase === 'walking') {
    return false;
  }
  return sweep.phase === 'reading' ? now >= sweep.readyAt : null;
}

/** From when a still may be read: at a stop, the moment the camera settled there; null while not at a stop. */
export function readableSince(sweep: SweepState): number | null {
  return sweep.phase === 'reading' ? sweep.readyAt : null;
}

export function sweepDone(sweep: SweepState): boolean {
  return sweep.phase === 'done';
}

/** Whether the sweep covered its whole reach: every stop was reached, none given up on. */
export function sweptWhole(sweep: SweepState): boolean {
  return sweep.phase === 'done' && sweep.missed === 0;
}

export function sweeping(sweep: SweepState): boolean {
  return sweep.phase === 'moving' || sweep.phase === 'reading' || sweep.phase === 'walking';
}
