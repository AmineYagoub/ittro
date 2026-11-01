// Shelf outlines: what SAM found, moved with the phone between SAM
// calls. Boxes and mask polygons live in source pixels; the tracker
// shifts both by the measured pan so they stay on the products while
// the phone moves. The phone never decodes masks: the relay ships the
// polygons, and moving them is a few dozen adds.
import type { ShelfBox, ShelfMask, ShelfOutline } from '../relay';

export type { ShelfBox, ShelfMask, ShelfOutline };

export interface PanShift {
  dx: number;
  dy: number;
  scale: number;
}

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value)));
}

export const CROP_MARGIN = 0.08;

export function expandBox(box: ShelfBox, margin: number): ShelfBox {
  const growW = (box.x2 - box.x1) * margin;
  const growH = (box.y2 - box.y1) * margin;
  return {
    ...box,
    x1: Math.max(0, box.x1 - growW),
    y1: Math.max(0, box.y1 - growH),
    x2: Math.min(box.w, box.x2 + growW),
    y2: Math.min(box.h, box.y2 + growH),
  };
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
  return outlines.map((outline) => {
    const box = moveBox(outline.box, shift);
    if (!outline.mask) {
      return { ...outline, box };
    }
    return { ...outline, box, mask: moveMask(outline.mask, outline.box, shift) };
  });
}

function moveMask(mask: ShelfMask, box: ShelfBox, shift: PanShift): ShelfMask {
  const dx = Math.round(shift.dx * shift.scale);
  const dy = Math.round(shift.dy * shift.scale);
  const points: number[] = [];
  for (let at = 0; at + 1 < mask.points.length; at += 2) {
    const x = mask.points[at] as number;
    const y = mask.points[at + 1] as number;
    points.push(clamp(x + dx, box.w), clamp(y + dy, box.h));
  }
  return { points };
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

export function mapPoints(points: number[], w: number, h: number, viewW: number, viewH: number): number[] {
  const scale = Math.max(viewW / w, viewH / h);
  const ox = (viewW - w * scale) / 2;
  const oy = (viewH - h * scale) / 2;
  const out: number[] = [];
  for (let at = 0; at + 1 < points.length; at += 2) {
    out.push(Math.round(ox + (points[at] as number) * scale), Math.round(oy + (points[at + 1] as number) * scale));
  }
  return out;
}

/** The outline's mask as SVG points on screen, or null when SAM sent no shape to draw. */
export function shapePoints(outline: ShelfOutline, viewW: number, viewH: number): string | null {
  const points = outline.mask?.points ?? [];
  if (points.length < 6) {
    return null;
  }
  return mapPoints(points, outline.box.w, outline.box.h, viewW, viewH).join(',');
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
