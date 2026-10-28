// Shelf outlines: what SAM found, moved with the phone between SAM
// calls. Boxes live in source pixels; the tracker shifts them by the
// measured pan so they stay on the products while the phone moves.
import type { ShelfBox, ShelfOutline } from '../relay';

export type { ShelfBox, ShelfOutline };

export interface PanShift {
  dx: number;
  dy: number;
  scale: number;
}

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value)));
}

export function moveBox(box: ShelfBox, shift: PanShift): ShelfBox {
  const dx = Math.round(shift.dx * shift.scale);
  const dy = Math.round(shift.dy * shift.scale);
  return {
    x1: clamp(box.x1 + dx, box.w),
    y1: clamp(box.y1 + dy, box.h),
    x2: clamp(box.x2 + dx, box.w),
    y2: clamp(box.y2 + dy, box.h),
    w: box.w,
    h: box.h,
    confidence: box.confidence,
  };
}

export function moveOutlines(outlines: ShelfOutline[], shift: PanShift): ShelfOutline[] {
  return outlines.map((outline) => ({ ...outline, box: moveBox(outline.box, shift) }));
}

export function boxArea(box: ShelfBox): number {
  return Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
}

export function boxOverlap(a: ShelfBox, b: ShelfBox): number {
  const across = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const down = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const union = boxArea(a) + boxArea(b) - across * down;
  if (union <= 0) {
    return 0;
  }
  return (across * down) / union;
}

export interface ViewBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function mapBox(box: ShelfBox, viewW: number, viewH: number): ViewBox {
  const scale = Math.max(viewW / box.w, viewH / box.h);
  const left = (viewW - box.w * scale) / 2 + box.x1 * scale;
  const top = (viewH - box.h * scale) / 2 + box.y1 * scale;
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round((box.x2 - box.x1) * scale),
    height: Math.round((box.y2 - box.y1) * scale),
  };
}
