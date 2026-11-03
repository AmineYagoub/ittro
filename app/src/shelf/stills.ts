// The latest shelf still, for questions about what the camera sees.
// The shelf search keeps each still it takes; when none is fresh, the
// camera's own source (useViewStill) takes one. The understanding
// call only uses a fresh one and never waits for a shot; a question
// asked on its own may wait for the camera to open.
export interface ViewStill {
  image: string;
  mime: string;
  w: number;
  h: number;
  at: number;
}

type StillSource = () => Promise<ViewStill | null>;

let latest: ViewStill | null = null;
let source: StillSource | null = null;

export function keepStill(still: ViewStill): void {
  latest = still;
}

/** The latest still when it is at most maxAgeMs old. */
export function freshStill(now: number, maxAgeMs: number): ViewStill | null {
  return latest && now - latest.at <= maxAgeMs ? latest : null;
}

export function setStillSource(next: StillSource | null): void {
  source = next;
}

/** A fresh still, from the search or the camera: null when the camera gives none. */
export async function takeViewStill(now: number, maxAgeMs: number): Promise<ViewStill | null> {
  const kept = freshStill(now, maxAgeMs);
  if (kept) {
    return kept;
  }
  const shot = source ? await source() : null;
  if (shot) {
    latest = shot;
  }
  return shot;
}

export function forgetStills(): void {
  latest = null;
}
