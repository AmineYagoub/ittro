// Stream restart waits: the first retry waits a second, then 2 s,
// 4 s and so on up to 30 s, so a dead relay never hot-loops the
// socket. A ready stream resets the wait; a clean stop starts fresh.
const DEFAULT_BASE_MS = 1000;

const RETRY_MAX_MS = 30000;

export interface StreamRetry {
  failed: () => void;
  ready: () => void;
  cancel: () => void;
  stop: () => void;
  start: (work: () => void) => void;
}

export function createStreamRetry(baseMs: number | undefined, log: (line: string) => void): StreamRetry {
  const base = baseMs ?? DEFAULT_BASE_MS;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    failed(): void {
      failures += 1;
    },
    ready(): void {
      failures = 0;
    },
    cancel,
    stop(): void {
      failures = 0;
      cancel();
    },
    start(work: () => void): void {
      cancel();
      if (failures <= 0) {
        work();
        return;
      }
      const waitMs = Math.min(RETRY_MAX_MS, base * 2 ** (failures - 1));
      log(`stream retry in ${waitMs}ms (attempt ${failures + 1})`);
      timer = setTimeout(() => {
        timer = null;
        work();
      }, waitMs);
    },
  };
}
