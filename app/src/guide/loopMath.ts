// Small geometry behind the guide loop, and the log lines that say
// where a cue came from (tip, box and hand width in photo pixels) and
// where the box was when it left the view, so a wrong cue or a wrong
// "out of view" on the phone can be checked by hand. A product out of
// the picture asks for the phone higher or lower when it lies further
// above or below than to a side: in t37 it was above, and the cue
// said left.
import type { ShelfBox } from '../relay';
import type { TipPoint, HandBox } from './types';

/** How much of a placed box must be inside the frame for the product to be in view. */
export const IN_FRAME_SHARE = 0.4;

export function shareInFrame(box: ShelfBox): number {
  const across = Math.max(0, Math.min(box.x2, box.w) - Math.max(box.x1, 0));
  const down = Math.max(0, Math.min(box.y2, box.h) - Math.max(box.y1, 0));
  const area = Math.max(1, (box.x2 - box.x1) * (box.y2 - box.y1));
  return (across * down) / area;
}

/** Which way to point the phone at a product out of the picture, from where its box lies. */
export function lostCue(box: ShelfBox): string {
  const x = (box.x1 + box.x2) / 2;
  const y = (box.y1 + box.y2) / 2;
  const across = box.w > 0 ? Math.max(0, -x, x - box.w) / box.w : 0;
  const down = box.h > 0 ? Math.max(0, -y, y - box.h) / box.h : 0;
  if (down > across) {
    return y < 0 ? 'phone_up_small' : 'phone_down_small';
  }
  return box.w > 0 && x < box.w / 2 ? 'phone_left_small' : 'phone_right_small';
}

/** The out-of-view log line: the box, and how much of it was in the frame (placed) or overlapped an outline. */
export function describeLost(box: ShelfBox, placed: boolean, overlap: number): string {
  const r = Math.round;
  const measure = placed ? `in frame ${shareInFrame(box).toFixed(2)}` : `overlap ${overlap.toFixed(2)}`;
  return `guide target out of view, box ${r(box.x1)},${r(box.y1)},${r(box.x2)},${r(box.y2)} ${measure}`;
}

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
