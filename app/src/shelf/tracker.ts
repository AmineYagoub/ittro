// The pan tracker: how far the picture moved between two frames, so
// outlines follow the products without another SAM call. It owns its
// grey copies: the camera reuses its buffer every frame, so ingesting
// must copy, never keep a reference. Tested with synthetic pans.
export interface GreyFrame {
  data: Uint8Array;
  w: number;
  h: number;
}

export interface Pan {
  dx: number;
  dy: number;
  score: number;
  changed: boolean;
}

export interface Tracker {
  previous: GreyFrame | null;
}

export function createTracker(): Tracker {
  return { previous: null };
}

export function ingestGrey(source: Uint8Array, w: number, h: number): GreyFrame {
  if (source.length < w * h) {
    throw new Error('grey frame is smaller than its size');
  }
  return { data: source.slice(0, w * h), w, h };
}

const BASE64_VALUES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let bits = 0;
  let held = 0;
  let at = 0;
  for (const char of clean) {
    const value = BASE64_VALUES.indexOf(char);
    if (value < 0) {
      throw new Error('grey bytes are not base64');
    }
    held = (held << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at] = (held >> bits) & 0xff;
      at += 1;
    }
  }
  return out.slice(0, at);
}

function frameDiff(a: GreyFrame, b: GreyFrame, dx: number, dy: number): number {
  let total = 0;
  let count = 0;
  const x0 = Math.max(0, -dx);
  const y0 = Math.max(0, -dy);
  const x1 = Math.min(a.w, b.w - dx);
  const y1 = Math.min(a.h, b.h - dy);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      total += Math.abs(a.data[y * a.w + x] - b.data[(y + dy) * b.w + (x + dx)]);
      count += 1;
    }
  }
  return count === 0 ? Number.POSITIVE_INFINITY : total / count;
}

export function estimatePan(previous: GreyFrame, next: GreyFrame, maxShift: number): Pan {
  if (previous.w !== next.w || previous.h !== next.h) {
    throw new Error('pan needs two frames of the same size');
  }
  let best = { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY };
  for (let dy = -maxShift; dy <= maxShift; dy += 1) {
    for (let dx = -maxShift; dx <= maxShift; dx += 1) {
      const score = frameDiff(previous, next, dx, dy);
      if (score < best.score) {
        best = { dx, dy, score };
      }
    }
  }
  return { dx: best.dx, dy: best.dy, score: best.score, changed: best.score > 25 };
}

export function trackPan(tracker: Tracker, frame: GreyFrame, maxShift: number): Pan | null {
  const previous = tracker.previous;
  tracker.previous = frame;
  if (!previous) {
    return null;
  }
  return estimatePan(previous, frame, maxShift);
}

export function sharpness(frame: GreyFrame): number {
  if (frame.w < 3 || frame.h < 3) {
    return 0;
  }
  let sum = 0;
  let squared = 0;
  let count = 0;
  for (let y = 1; y < frame.h - 1; y += 1) {
    for (let x = 1; x < frame.w - 1; x += 1) {
      const at = y * frame.w + x;
      const lap =
        4 * frame.data[at] -
        frame.data[at - 1] -
        frame.data[at + 1] -
        frame.data[at - frame.w] -
        frame.data[at + frame.w];
      sum += lap;
      squared += lap * lap;
      count += 1;
    }
  }
  const mean = sum / count;
  return squared / count - mean * mean;
}

export function pickSharpest(frames: GreyFrame[]): number {
  let best = 0;
  let bestScore = -1;
  for (let at = 0; at < frames.length; at += 1) {
    const score = sharpness(frames[at] as GreyFrame);
    if (score > bestScore) {
      bestScore = score;
      best = at;
    }
  }
  return best;
}
