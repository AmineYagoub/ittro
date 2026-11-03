// Mic stats behind the phone log line: chunk rate, arrival gaps,
// sequence jumps, pre-ready drops, failed sends, gated frames and the
// level sent, plus decoding base64 mic chunks. Pure, so recorded
// arrivals walk it on the Mac. The level tells a mic gone quiet from
// a stream gone deaf (t23 heard nothing for minutes with frames up).
export function decodeChunk(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function fullScaleDb(amplitude: number): number {
  return amplitude > 0 ? Math.round(20 * Math.log10(amplitude / 32768)) : -120;
}

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
  /** Frames the voice gate silenced. */
  gated: number;
  /** The loudest sample sent, in dB below full scale; null when the gate silenced every frame. */
  peakDb: number | null;
  /** The mean level sent, in dB below full scale; null when the gate silenced every frame. */
  rmsDb: number | null;
}

export interface MicStats {
  arrival: (sequence: number) => void;
  /** Each decoded frame on its way up: silenced by the gate, or measured. */
  frame: (heard: Uint8Array | null, gated: boolean) => void;
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
  let gated = 0;
  let peak = 0;
  let sumSquares = 0;
  let samples = 0;
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
    frame(heard: Uint8Array | null, closed: boolean): void {
      if (!heard) {
        return;
      }
      if (closed) {
        gated += 1;
        return;
      }
      for (let at = 0; at + 1 < heard.length; at += 2) {
        const sample = (((heard[at + 1] as number) << 24) >> 16) | (heard[at] as number);
        peak = Math.max(peak, Math.abs(sample));
        sumSquares += sample * sample;
        samples += 1;
      }
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
        gated,
        peakDb: samples > 0 ? fullScaleDb(peak) : null,
        rmsDb: samples > 0 ? fullScaleDb(Math.sqrt(sumSquares / samples)) : null,
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
      gated = 0;
      peak = 0;
      sumSquares = 0;
      samples = 0;
      start = now();
    },
  };
}

/** The mic's log line: frame rate, gaps, frames lost before ready or on send, frames the voice gate silenced, and the level sent. */
export function micLine(summary: MicSummary): string {
  const level = summary.peakDb === null ? 'level -' : `level peak ${summary.peakDb} rms ${summary.rmsDb} dBFS`;
  return `mic ${summary.ratePerSecond.toFixed(1)}/s gap p50 ${summary.gapP50}ms p95 ${summary.gapP95}ms max ${summary.gapMax}ms seqgaps ${summary.seqGaps} notready ${summary.notReady} senderr ${summary.sendErr} gated ${summary.gated} ${level}`;
}

// The frame that goes up the wire: the room, or silence while the
// voice gate is closed or the chunk failed to decode.
export function uplinkFrame(heard: Uint8Array | null, silence: Uint8Array, gateClosed: boolean): Uint8Array {
  if (gateClosed || !heard) {
    return silence;
  }
  return heard;
}
