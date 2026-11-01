// The sweep with memory (shelf-awareness plan part 4), replacing the
// alternating "turn right, turn left": when the product is not in view,
// Ittro walks the camera along the shelf in steps of 0.6 of a frame so
// views overlap, right to +1.2, then left to -1.2, then down 0.5 to the
// shelf below, and reads once at each stop. The camera's own pan (frame
// units since it opened) says how far it turned: the view offset is
// minus the pan, since turning right moves the picture left. A new
// camera opening starts again. Turning faster than half a frame a
// second asks for slower. Going past a stop counts as reaching it, and
// a stop the camera already passed is skipped, so no place is read
// twice. A cue that moved nothing is said once more, and a stop never
// reached is read where the camera is after 15 s, so the sweep never
// stalls. After the full reach, a shelf that runs on past an end sends
// the shopper two steps that way, at most twice.
import type { CameraPan } from './loopTypes';

export type SweepCue = 'start' | 'right' | 'left' | 'down' | 'stop' | 'slower' | 'walkRight' | 'walkLeft';

export type SweepPhase = 'idle' | 'moving' | 'reading' | 'walking' | 'done';

interface Offset {
  x: number;
  y: number;
}

export interface SweepState {
  phase: SweepPhase;
  step: number;
  origin: Offset;
  session: number | null;
  /** Where the camera pointed when the current step's cue was given, and when. */
  begun: Offset;
  movedAt: number;
  repeated: boolean;
  last: { offset: Offset; at: number } | null;
  slowerAt: number;
  walkedAt: number;
  walks: number;
  edgeLeft: boolean;
  edgeRight: boolean;
  checked: number;
}

const STEPS: Offset[] = [
  { x: 0.6, y: 0 },
  { x: 1.2, y: 0 },
  { x: -0.6, y: 0 },
  { x: -1.2, y: 0 },
  { x: -1.2, y: 0.5 },
];

const REACHED = 0.1;
const FAST_PER_S = 0.5;
const SLOWER_GAP_MS = 3000;
const REPEAT_MS = 5000;
const BUDGED = 0.15;
const GIVE_UP_MS = 15000;
const WALK_WAIT_MS = 9000;
const WALKS_MAX = 2;
const EDGE = 0.04;
const ORIGIN: Offset = { x: 0, y: 0 };

export function idleSweep(): SweepState {
  return {
    phase: 'idle',
    step: 0,
    origin: { x: 0, y: 0 },
    session: null,
    begun: { x: 0, y: 0 },
    movedAt: 0,
    repeated: false,
    last: null,
    slowerAt: Number.NEGATIVE_INFINITY,
    walkedAt: 0,
    walks: 0,
    edgeLeft: false,
    edgeRight: false,
    checked: 0,
  };
}

function offsetOf(sweep: SweepState, pan: CameraPan): Offset {
  return { x: -(pan.x - sweep.origin.x), y: -(pan.y - sweep.origin.y) };
}

function stepTarget(step: number): Offset {
  return step < 0 ? ORIGIN : (STEPS[step] ?? ORIGIN);
}

function axisOf(step: number): 'x' | 'y' {
  return stepTarget(step).y !== stepTarget(step - 1).y ? 'y' : 'x';
}

function passed(step: number, at: Offset): boolean {
  const axis = axisOf(step);
  const to = stepTarget(step)[axis];
  const from = stepTarget(step - 1)[axis];
  return to >= from ? at[axis] >= to - REACHED : at[axis] <= to + REACHED;
}

function cueFor(step: number, at: Offset): SweepCue {
  if (axisOf(step) === 'y') {
    return 'down';
  }
  return stepTarget(step).x >= at.x ? 'right' : 'left';
}

function restartAt(sweep: SweepState, pan: CameraPan, now: number, step: number): void {
  sweep.origin = { x: pan.x, y: pan.y };
  sweep.session = pan.session ?? null;
  sweep.step = step;
  sweep.begun = { x: 0, y: 0 };
  sweep.movedAt = now;
  sweep.repeated = false;
  sweep.last = { offset: { x: 0, y: 0 }, at: now };
  sweep.edgeLeft = false;
  sweep.edgeRight = false;
  sweep.phase = 'moving';
}

/** The product is not in view here: the sweep starts from where the camera points. */
export function startSweep(sweep: SweepState, pan: CameraPan, now: number): SweepCue {
  restartAt(sweep, pan, now, 0);
  sweep.walks = 0;
  sweep.checked = 0;
  return 'start';
}

/** Every half second while sweeping: what to say as the camera turns, if anything. */
export function sweepTick(sweep: SweepState, pan: CameraPan | null, now: number): SweepCue | null {
  if (sweep.phase === 'walking' && now - sweep.walkedAt >= WALK_WAIT_MS && pan) {
    restartAt(sweep, pan, now, -1);
    sweep.phase = 'reading';
    return null;
  }
  if (sweep.phase !== 'moving' || !pan) {
    return null;
  }
  if (sweep.session !== null && pan.session !== undefined && pan.session !== sweep.session) {
    restartAt(sweep, pan, now, 0);
    return cueFor(0, ORIGIN);
  }
  const offset = offsetOf(sweep, pan);
  const last = sweep.last;
  sweep.last = { offset, at: now };
  if (passed(sweep.step, offset) || now - sweep.movedAt >= GIVE_UP_MS) {
    sweep.phase = 'reading';
    return 'stop';
  }
  if (!sweep.repeated && now - sweep.movedAt >= REPEAT_MS && Math.hypot(offset.x - sweep.begun.x, offset.y - sweep.begun.y) < BUDGED) {
    sweep.repeated = true;
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

function noteEdges(sweep: SweepState, target: Offset, outlines: Array<{ box: { x1: number; x2: number; w: number } }>): void {
  if (target.x >= 1.2) {
    sweep.edgeRight = outlines.some((outline) => outline.box.x2 >= outline.box.w * (1 - EDGE));
  }
  if (target.x <= -1.2 && target.y === 0) {
    sweep.edgeLeft = outlines.some((outline) => outline.box.x1 <= outline.box.w * EDGE);
  }
}

/** The read at a stop found nothing: the next step's cue, a walk, or null when the reach is done. */
export function sweepRead(sweep: SweepState, outlines: Array<{ box: { x1: number; x2: number; w: number } }>, checked: number, now: number): SweepCue | null {
  sweep.checked += checked;
  const here = sweep.last?.offset ?? stepTarget(sweep.step);
  do {
    noteEdges(sweep, stepTarget(sweep.step), outlines);
    sweep.step += 1;
  } while (sweep.step < STEPS.length && passed(sweep.step, here));
  if (sweep.step < STEPS.length) {
    sweep.phase = 'moving';
    sweep.begun = here;
    sweep.movedAt = now;
    sweep.repeated = false;
    return cueFor(sweep.step, here);
  }
  if (sweep.walks < WALKS_MAX && (sweep.edgeRight || sweep.edgeLeft)) {
    sweep.walks += 1;
    sweep.phase = 'walking';
    sweep.walkedAt = now;
    return sweep.edgeRight ? 'walkRight' : 'walkLeft';
  }
  sweep.phase = 'done';
  return null;
}

/** Whether a cloud pass may run now: never while the camera turns, at once at a stop; null leaves it to the loop. */
export function sweepDue(sweep: SweepState): boolean | null {
  if (sweep.phase === 'moving' || sweep.phase === 'walking') {
    return false;
  }
  return sweep.phase === 'reading' ? true : null;
}

export function sweepDone(sweep: SweepState): boolean {
  return sweep.phase === 'done';
}

export function sweeping(sweep: SweepState): boolean {
  return sweep.phase === 'moving' || sweep.phase === 'reading' || sweep.phase === 'walking';
}
