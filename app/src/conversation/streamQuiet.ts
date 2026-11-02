// A stream that hears nothing is reopened while Ittro speaks. In t22
// the socket stayed open for 150 s after its last transcript and
// brought nothing back, so «ابحث عن غيره» at the second yes was never
// heard, while Meta's own stream, probed directly, transcribed every
// phrase for 4.5 min. The mic is gated while Ittro's voice plays, so a
// socket reopened then is ready before the shopper answers, and
// nothing the shopper says is cut. Any moment of Ittro's voice past
// the limit will do: t23 chained two lines with the gate closed
// throughout, and waiting for a line's start cost it 16 s.

/** How long the relay may send nothing before the stream is reopened while Ittro speaks. */
export const QUIET_REOPEN_MS = 30000;

export interface QuietWatch {
  /** Anything from the relay: the stream is alive. */
  heard: () => void;
  /** On every mic chunk: how long the stream has heard nothing, when Ittro's voice is playing and that is past the limit; else 0. */
  due: (gateClosed: boolean) => number;
}

export function createQuietWatch(now: () => number, limitMs: number = QUIET_REOPEN_MS): QuietWatch {
  let heardAt = now();
  return {
    heard(): void {
      heardAt = now();
    },
    due(gateClosed: boolean): number {
      const silentMs = now() - heardAt;
      if (!gateClosed || silentMs < limitMs) {
        return 0;
      }
      heardAt = now();
      return silentMs;
    },
  };
}
