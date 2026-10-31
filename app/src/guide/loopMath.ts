// Small geometry behind the guide loop, and the one log line that
// says where a cue came from: tip, box and hand width in photo
// pixels, so a wrong cue on the phone can be checked by hand.
import type { ShelfBox } from '../relay';
import type { TipPoint, HandBox } from './types';

export function inside(tip: TipPoint, box: ShelfBox): boolean {
  return tip.x >= box.x1 && tip.x <= box.x2 && tip.y >= box.y1 && tip.y <= box.y2;
}

export function cosine(a: TipPoint, b: TipPoint): number {
  const lengths = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  if (lengths <= 0) {
    return 0;
  }
  return (a.x * b.x + a.y * b.y) / lengths;
}

export function sameBox(a: ShelfBox, b: ShelfBox): boolean {
  return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
}

export function describeCue(id: string, tip: TipPoint, box: ShelfBox, handWidth: number, hand?: HandBox): string {
  const r = Math.round;
  const whole = hand ? ` handbox ${r(hand.x1)},${r(hand.y1)},${r(hand.x2)},${r(hand.y2)}` : '';
  return `guide cue ${id} tip ${r(tip.x)},${r(tip.y)} box ${r(box.x1)},${r(box.y1)},${r(box.x2)},${r(box.y2)} hand ${r(handWidth)}${whole}`;
}
