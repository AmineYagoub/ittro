// Steering, pure: one axis at a time, left or right before up or
// down, a small correction under one box width, the almost ring at
// the outline, covering inside it. The ring and the small threshold
// scale with the product box, never with the hand: a hand near the
// lens is wider than the product, and a hand-sized ring swallowed
// the box. Proximity 0 far to 1 touching drives the tick gap and the
// five meter segments.
import type { ShelfBox } from '../relay';
import type { GuidePosition } from '../conversation/types';
import type { GuideDir, SteerVerdict, TipPoint } from './types';

const ALMOST_MARGIN = 0.25;

export function almostMargin(box: ShelfBox): number {
  const short = Math.min(box.x2 - box.x1, box.y2 - box.y1);
  return Math.max(1, ALMOST_MARGIN * short);
}

export function steerFor(tip: TipPoint, box: ShelfBox): SteerVerdict {
  const margin = almostMargin(box);
  const boxWidth = Math.max(1, box.x2 - box.x1);
  const insideInner =
    tip.x >= box.x1 + margin && tip.x <= box.x2 - margin && tip.y >= box.y1 + margin && tip.y <= box.y2 - margin;
  if (insideInner) {
    return { kind: 'covering' };
  }
  const insideOuter = tip.x >= box.x1 - margin && tip.x <= box.x2 + margin && tip.y >= box.y1 - margin && tip.y <= box.y2 + margin;
  if (insideOuter) {
    return { kind: 'almost' };
  }
  const gapX = tip.x < box.x1 ? box.x1 - tip.x : tip.x > box.x2 ? tip.x - box.x2 : 0;
  const gapY = tip.y < box.y1 ? box.y1 - tip.y : tip.y > box.y2 ? tip.y - box.y2 : 0;
  if (gapX > margin) {
    return { kind: 'move', dir: tip.x < box.x1 ? 'right' : 'left', small: gapX < boxWidth };
  }
  if (gapY > margin) {
    return { kind: 'move', dir: tip.y < box.y1 ? 'down' : 'up', small: gapY < boxWidth };
  }
  return { kind: 'almost' };
}

export function cueIdFor(dir: GuideDir, small: boolean, cont: boolean): string {
  if (cont) {
    return `hand_${dir}_continue`;
  }
  return small ? `hand_${dir}_small` : `hand_${dir}`;
}

export function continueIdFor(cue: string): string {
  const base = cue.replace(/_small$/, '').replace(/_continue$/, '');
  return `${base}_continue`;
}

export function proximityFor(tip: TipPoint, box: ShelfBox, diag: number): number {
  if (diag <= 0) {
    return 0;
  }
  const centerX = (box.x1 + box.x2) / 2;
  const centerY = (box.y1 + box.y2) / 2;
  const distance = Math.hypot(tip.x - centerX, tip.y - centerY);
  return Math.min(1, Math.max(0, 1 - distance / (0.7 * diag)));
}

export function tickGapMs(proximity: number): number {
  const clamped = Math.min(1, Math.max(0, proximity));
  return Math.round(600 - clamped * 480);
}

export function meterSegments(proximity: number): number {
  const clamped = Math.min(1, Math.max(0, proximity));
  return 1 + Math.round(clamped * 4);
}

export function positionFor(box: ShelfBox, photoW: number): GuidePosition {
  if (photoW <= 0) {
    return 'middle';
  }
  const center = (box.x1 + box.x2) / 2 / photoW;
  if (center < 1 / 3) {
    return 'left';
  }
  if (center > 2 / 3) {
    return 'right';
  }
  return 'middle';
}

export function centerOf(box: ShelfBox): TipPoint {
  return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
}
