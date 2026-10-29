// Mic stats behind the phone log line: chunk rate, arrival gaps,
// sequence jumps, pre-ready drops and failed sends. Pure, so
// recorded arrivals walk it on the Mac.
function percentile(sorted: number[], rank: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(rank * sorted.length))] as number;
}

export interface MicSummary {
  ratePerSecond: number;
  gapP50: number;
  gapP95: number;
  gapMax: number;
  seqGaps: number;
  notReady: number;
  sendErr: number;
}

export interface MicStats {
  arrival: (sequence: number) => void;
  dropPreReady: () => void;
  failSend: () => void;
  count: () => number;
  snapshot: () => MicSummary;
  reset: () => void;
}

export function createMicStats(now: () => number): MicStats {
  let arrivals = 0;
  let gaps: number[] = [];
  let lastArrival = 0;
  let lastSequence = -1;
  let seqGaps = 0;
  let notReady = 0;
  let sendErr = 0;
  let start = now();

  return {
    arrival(sequence: number): void {
      const at = now();
      arrivals += 1;
      if (lastArrival > 0) {
        gaps.push(at - lastArrival);
      }
      lastArrival = at;
      if (lastSequence >= 0 && sequence !== lastSequence + 1) {
        seqGaps += 1;
      }
      lastSequence = sequence;
    },
    dropPreReady(): void {
      notReady += 1;
    },
    failSend(): void {
      sendErr += 1;
    },
    count(): number {
      return arrivals;
    },
    snapshot(): MicSummary {
      const secs = (now() - start) / 1000;
      const ordered = [...gaps].sort((a, b) => a - b);
      return {
        ratePerSecond: arrivals / Math.max(1, secs),
        gapP50: percentile(ordered, 0.5),
        gapP95: percentile(ordered, 0.95),
        gapMax: ordered.length > 0 ? (ordered[ordered.length - 1] as number) : 0,
        seqGaps,
        notReady,
        sendErr,
      };
    },
    reset(): void {
      arrivals = 0;
      gaps = [];
      lastArrival = 0;
      lastSequence = -1;
      seqGaps = 0;
      notReady = 0;
      sendErr = 0;
      start = now();
    },
  };
}
