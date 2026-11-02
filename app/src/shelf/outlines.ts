// Shelf outlines: what SAM found, moved with the phone between SAM
// calls. Boxes and mask polygons live in source pixels; the tracker
// shifts both by the measured pan so they stay on the products while
// the phone moves, and a cut is placed where the camera has it now,
// grown about the frame's middle as the picture grew (t39). The phone
// never decodes masks: the relay ships the polygons, and moving them
// is a few dozen adds.
import type { CameraOutline } from 'ittro-sensors';
import type { ShelfBox, ShelfMask, ShelfOutline } from '../relay';

export type { ShelfBox, ShelfMask, ShelfOutline };

interface Pan {
  x: number;
  y: number;
  s?: number;
  session?: number;
}

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

/** SAM's outlines tagged with the still they were cut from, when its number is known, and where the camera pointed for it. */
export function anchorOutlines(outlines: ShelfOutline[], shot: number | undefined, pan?: Pan | null): ShelfOutline[] {
  if (shot === undefined) {
    return outlines;
  }
  return outlines.map((outline) => ({
    ...outline,
    anchor: { shot, box: outline.box, points: outline.mask?.points ?? null, ...(pan ? { pan } : {}) },
  }));
}

/** Where an outline's product is now, as the native outline draws it: SAM's box on its still, moved and grown by the camera's motion since; its own box when that motion is unknown. */
export function boxNow(outline: ShelfOutline, now: Pan | null, stillPan: (shot: number) => Pan | null): ShelfBox {
  const anchor = outline.anchor;
  const from = anchor ? (anchor.pan ?? stillPan(anchor.shot)) : null;
  if (!anchor || !from || !now || (from.session ?? 0) !== (now.session ?? 0)) {
    return outline.box;
  }
  const grew = (now.s ?? 1) / (from.s ?? 1);
  return grownBox(anchor.box, grew, (now.x - grew * from.x) * anchor.box.w, (now.y - grew * from.y) * anchor.box.h);
}

/** A box grown `grew` times about its frame's middle, then moved by dx and dy, as the camera draws a cut. */
export function grownBox(box: ShelfBox, grew: number, dx: number, dy: number): ShelfBox {
  const x = (at: number) => at + (grew - 1) * (at - box.w / 2) + dx;
  const y = (at: number) => at + (grew - 1) * (at - box.h / 2) + dy;
  return { ...box, x1: x(box.x1), y1: y(box.y1), x2: x(box.x2), y2: y(box.y2) };
}

/** The guided outline for the camera to draw: SAM's cut, its still and where the camera pointed for it, else the box as it is now. */
export function cameraOutline(target: ShelfOutline | null, label: string): CameraOutline | null {
  if (!target) {
    return null;
  }
  const anchor = target.anchor;
  const box = anchor?.box ?? target.box;
  const shot = anchor?.shot ?? null;
  const pan = anchor?.pan;
  return {
    key: `${shot ?? 'now'}:${target.id}:${box.x1},${box.y1},${box.x2},${box.y2}:${label}`,
    name: label,
    x1: box.x1,
    y1: box.y1,
    x2: box.x2,
    y2: box.y2,
    w: box.w,
    h: box.h,
    points: anchor ? anchor.points : (target.mask?.points ?? null),
    shot,
    panX: pan?.x ?? null,
    panY: pan?.y ?? null,
    panS: pan?.s ?? null,
    panSession: pan?.session ?? null,
  };
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
