// Grey frames from cloud stills: decode, ingest and compare
// sharpness, so each cloud pass reads its sharpest photo. The pan
// itself runs natively on live frames; JavaScript only applies the
// shifts it reports. Tested with synthetic frames.
export interface GreyFrame {
  data: Uint8Array;
  w: number;
  h: number;
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
