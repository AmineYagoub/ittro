// Guide shapes: one hand fix per frame outside the statechart, and
// the steering verdicts the loop turns into guide events.
export interface HandFix {
  x: number;
  y: number;
  confidence: number;
  handWidth: number;
  atMs: number;
}

export interface TipPoint {
  x: number;
  y: number;
}

export type GuideDir = 'left' | 'right' | 'up' | 'down';

export type SteerVerdict = { kind: 'move'; dir: GuideDir; small: boolean } | { kind: 'almost' } | { kind: 'covering' };
