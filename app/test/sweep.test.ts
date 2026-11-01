// The sweep with memory (plan part 4): right in overlapping steps to
// +1.2 frames, left to -1.2, down 0.5, one read per stop, "slower"
// when turning fast, a fresh start on a new camera opening, and two
// steps along the shelf when it runs on past an end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { idleSweep, startSweep, sweepRead, sweepTick, sweeping } from '../src/shelf/sweep';
import type { SweepCue, SweepState } from '../src/shelf/sweep';

const W = 960;

function walkTo(sweep: SweepState, from: { x: number; y: number }, to: { x: number; y: number }, at: { now: number }): SweepCue[] {
  const cues: SweepCue[] = [];
  const steps = Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / 0.15);
  for (let n = 1; n <= steps; n += 1) {
    at.now += 500;
    const pan = { x: -(from.x + ((to.x - from.x) * n) / steps), y: -(from.y + ((to.y - from.y) * n) / steps), session: 1 };
    const cue = sweepTick(sweep, pan, at.now);
    if (cue) {
      cues.push(cue);
    }
    if (cue === 'stop') {
      break;
    }
  }
  return cues;
}

test('a full sweep stops at every step once, then ends', () => {
  const sweep = idleSweep();
  const at = { now: 0 };
  assert.equal(startSweep(sweep, { x: 0, y: 0, session: 1 }, at.now), 'start');
  const route = [
    { x: 0, y: 0 },
    { x: 0.6, y: 0 },
    { x: 1.2, y: 0 },
    { x: -0.6, y: 0 },
    { x: -1.2, y: 0 },
    { x: -1.2, y: 0.5 },
  ];
  const said: Array<SweepCue | null> = [];
  for (let leg = 1; leg < route.length; leg += 1) {
    assert.deepEqual(walkTo(sweep, route[leg - 1]!, route[leg]!, at), ['stop'], `leg ${leg}`);
    assert.equal(sweep.phase, 'reading');
    said.push(sweepRead(sweep, [], 2, at.now));
  }
  assert.deepEqual(said, ['right', 'left', 'left', 'down', null]);
  assert.equal(sweep.phase, 'done');
  assert.equal(sweep.checked, 10);
  assert.equal(sweeping(sweep), false);
});

test('turning faster than half a frame a second asks for slower, at most every 3 s', () => {
  const sweep = idleSweep();
  startSweep(sweep, { x: 0, y: 0, session: 1 }, 0);
  assert.equal(sweepTick(sweep, { x: -0.4, y: 0, session: 1 }, 500), 'slower');
  assert.equal(sweepTick(sweep, { x: -0.45, y: 0, session: 1 }, 600), null);
  assert.equal(sweepTick(sweep, { x: -0.6, y: 0, session: 1 }, 700), 'stop');
});

test('a new camera opening starts the sweep again from where it points', () => {
  const sweep = idleSweep();
  startSweep(sweep, { x: 0, y: 0, session: 1 }, 0);
  sweepTick(sweep, { x: -0.3, y: 0, session: 1 }, 1000);
  assert.equal(sweepTick(sweep, { x: 5, y: 0, session: 2 }, 1500), 'right');
  assert.equal(sweepTick(sweep, { x: 4.4, y: 0, session: 2 }, 3000), 'stop');
});

test('a shelf that runs on past the right end sends the shopper two steps, then reads again', () => {
  const sweep = idleSweep();
  const at = { now: 0 };
  startSweep(sweep, { x: 0, y: 0, session: 1 }, 0);
  const edge = [{ box: { x1: 700, x2: W - 2, w: W } }];
  const route = [
    { x: 0, y: 0 },
    { x: 0.6, y: 0 },
    { x: 1.2, y: 0 },
    { x: -0.6, y: 0 },
    { x: -1.2, y: 0 },
    { x: -1.2, y: 0.5 },
  ];
  let last: SweepCue | null = null;
  for (let leg = 1; leg < route.length; leg += 1) {
    walkTo(sweep, route[leg - 1]!, route[leg]!, at);
    last = sweepRead(sweep, leg === 2 ? edge : [], 1, at.now);
  }
  assert.equal(last, 'walkRight');
  assert.equal(sweep.phase, 'walking');
  assert.equal(sweepTick(sweep, { x: 3, y: 0, session: 1 }, at.now + 2000), null);
  assert.equal(sweep.phase, 'walking');
  assert.equal(sweepTick(sweep, { x: 3, y: 0, session: 1 }, at.now + 6500), null);
  assert.equal(sweep.phase, 'walking');
  sweepTick(sweep, { x: 3, y: 0, session: 1 }, at.now + 9500);
  assert.equal(sweep.phase, 'reading');
  assert.equal(sweepRead(sweep, [], 1, at.now + 12000), 'right');
  assert.equal(sweep.phase, 'moving');
});

test('without a pan the sweep waits', () => {
  const sweep = idleSweep();
  startSweep(sweep, { x: 0, y: 0, session: 1 }, 0);
  assert.equal(sweepTick(sweep, null, 500), null);
  assert.equal(sweep.phase, 'moving');
});

test('turning past a stop counts as reaching it, and a stop already passed is skipped', () => {
  const sweep = idleSweep();
  startSweep(sweep, { x: 0, y: 0, session: 1 }, 0);
  assert.equal(sweepTick(sweep, { x: -0.3, y: 0, session: 1 }, 1000), null);
  assert.equal(sweepTick(sweep, { x: -1.25, y: 0, session: 1 }, 4000), 'stop');
  assert.equal(sweepRead(sweep, [], 3, 9000), 'left');
  assert.equal(sweep.step, 2);
});

test('a cue that moved nothing is said once more, and a stop never reached is read where the camera is', () => {
  const sweep = idleSweep();
  startSweep(sweep, { x: 0, y: 0, session: 1 }, 0);
  assert.equal(sweepTick(sweep, { x: 0, y: 0, session: 1 }, 4500), null);
  assert.equal(sweepTick(sweep, { x: -0.05, y: 0, session: 1 }, 5000), 'right');
  assert.equal(sweepTick(sweep, { x: -0.05, y: 0, session: 1 }, 10000), null);
  assert.equal(sweepTick(sweep, { x: -0.2, y: 0, session: 1 }, 15000), 'stop');
  assert.equal(sweep.phase, 'reading');
  assert.equal(sweepRead(sweep, [], 1, 20000), 'right');
  assert.equal(sweep.step, 1);
});

test('the step down asks to tilt, whatever the turn left over', () => {
  const sweep = idleSweep();
  startSweep(sweep, { x: 0, y: 0, session: 1 }, 0);
  sweep.step = 3;
  sweep.last = { offset: { x: -1.15, y: 0 }, at: 0 };
  assert.equal(sweepRead(sweep, [], 1, 1000), 'down');
  assert.equal(sweepTick(sweep, { x: 1.1, y: -0.2, session: 1 }, 2000), null);
  assert.equal(sweepTick(sweep, { x: 1.1, y: -0.45, session: 1 }, 2500), 'stop');
});
