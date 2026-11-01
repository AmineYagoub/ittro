// The sweep's path (shelf-awareness plan part 4): the stops in frame
// units from where the sweep began, right to +1.2 in steps of 0.6 so
// views overlap, left to -1.2, then down 0.5 to the shelf below; which
// way to turn for a stop, whether the camera went past it, and how far
// it went the right way. The view offset is minus the camera's pan,
// since turning right moves the picture left.
import type { CameraPan } from './loopTypes';

export interface Offset {
  x: number;
  y: number;
}

export const STEPS: Offset[] = [
  { x: 0.6, y: 0 },
  { x: 1.2, y: 0 },
  { x: -0.6, y: 0 },
  { x: -1.2, y: 0 },
  { x: -1.2, y: 0.5 },
];

export const ORIGIN: Offset = { x: 0, y: 0 };

const REACHED = 0.1;

/** Where the camera points, from the pan it had when the sweep began there. */
export function offsetFrom(origin: Offset, pan: CameraPan): Offset {
  return { x: -(pan.x - origin.x), y: -(pan.y - origin.y) };
}

/** The stop a step goes to; before the first step, the spot the sweep began at. */
export function stepTarget(step: number): Offset {
  return step < 0 ? ORIGIN : (STEPS[step] ?? ORIGIN);
}

function axisOf(step: number): 'x' | 'y' {
  return stepTarget(step).y !== stepTarget(step - 1).y ? 'y' : 'x';
}

/** Whether the camera reached the step's stop, or went past it. */
export function passed(step: number, at: Offset): boolean {
  const axis = axisOf(step);
  const to = stepTarget(step)[axis];
  const from = stepTarget(step - 1)[axis];
  return to >= from ? at[axis] >= to - REACHED : at[axis] <= to + REACHED;
}

/** How far the camera went the step's way from where its cue was heard: negative the wrong way. */
export function progress(step: number, from: Offset, at: Offset): number {
  const axis = axisOf(step);
  const sign = stepTarget(step)[axis] >= stepTarget(step - 1)[axis] ? 1 : -1;
  return (at[axis] - from[axis]) * sign;
}

/** The way to turn for the step's stop from where the camera points. */
export function cueFor(step: number, at: Offset): 'right' | 'left' | 'down' {
  if (axisOf(step) === 'y') {
    return 'down';
  }
  return stepTarget(step).x >= at.x ? 'right' : 'left';
}
