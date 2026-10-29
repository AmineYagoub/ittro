// Live hand frames into the guide loop: native events become hand
// fixes in photo pixels, and the stats behind the phone log line —
// hands per second, conversion and detection p50/p95, frame-to-cue
// p50 and dropped frames. Pure, so recorded frames walk it on the
// Mac.
import type { HandFrame } from 'ittro-sensors';
import type { HandFix } from './types';

export function handFixFromEvent(frame: HandFrame, photoW: number, photoH: number, atMs: number): HandFix | null {
  if (!frame.present || photoW <= 0 || photoH <= 0) {
    return null;
  }
  return {
    x: frame.x * photoW,
    y: frame.y * photoH,
    confidence: frame.confidence,
    handWidth: frame.handWidth * photoW,
    atMs,
  };
}

let latestFix: HandFix | null = null;

export function noteHandFix(fix: HandFix | null): void {
  latestFix = fix;
}

export function lastHandFix(): HandFix | null {
  return latestFix;
}

function percentile(sorted: number[], rank: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(rank * sorted.length))] as number;
}

export interface FrameSummary {
  handsPerSecond: number;
  convertP50: number;
  detectP50: number;
  detectP95: number;
  cueP50: number;
  dropped: number;
}

export interface FrameStats {
  noteFrame: (frame: HandFrame) => void;
  noteCue: () => void;
  frames: () => number;
  snapshot: () => FrameSummary;
  reset: () => void;
}

export function createFrameStats(now: () => number): FrameStats {
  let count = 0;
  let converts: number[] = [];
  let detects: number[] = [];
  let cues: number[] = [];
  let lastArrival = 0;
  let firstDropped = -1;
  let lastDropped = 0;
  let start = now();

  return {
    noteFrame(frame: HandFrame): void {
      count += 1;
      lastArrival = now();
      converts.push(frame.convertMs);
      if (frame.present) {
        detects.push(frame.detectMs);
      }
      if (firstDropped < 0) {
        firstDropped = frame.dropped;
      }
      lastDropped = frame.dropped;
    },
    noteCue(): void {
      if (lastArrival > 0) {
        cues.push(now() - lastArrival);
      }
    },
    frames(): number {
      return count;
    },
    snapshot(): FrameSummary {
      const secs = (now() - start) / 1000;
      const ordered = [...detects].sort((a, b) => a - b);
      const cueOrdered = [...cues].sort((a, b) => a - b);
      const convertOrdered = [...converts].sort((a, b) => a - b);
      return {
        handsPerSecond: count / Math.max(1, secs),
        convertP50: percentile(convertOrdered, 0.5),
        detectP50: percentile(ordered, 0.5),
        detectP95: percentile(ordered, 0.95),
        cueP50: percentile(cueOrdered, 0.5),
        dropped: firstDropped < 0 ? 0 : lastDropped - firstDropped,
      };
    },
    reset(): void {
      count = 0;
      converts = [];
      detects = [];
      cues = [];
      lastArrival = 0;
      firstDropped = -1;
      lastDropped = 0;
      start = now();
    },
  };
}
