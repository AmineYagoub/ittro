// The shelf inventory (plan part 1): every product the shelf reads and
// finds named, with how often each was read, where its outline was and
// where the camera pointed then. Nothing extra is asked for: the reads
// already carry the names. Questions send the names as a hint, and the
// not-here summary names what was seen. Entries age out after a while,
// since the shopper moves on to other shelves, and a new search (a new
// product, or the same one looked for again at another shelf) starts
// afresh, so no summary names what an earlier shelf held.
import type { ShelfBox, ShelfRead } from '../relay';
import type { CameraPan } from './loopTypes';

export interface SeenProduct {
  name: string;
  count: number;
  box: ShelfBox;
  pan: CameraPan | null;
  at: number;
}

const SEEN_MAX = 40;

const seen = new Map<string, SeenProduct>();

let owner = '';

/** A name as the inventory keys it: lower case, words only, so two spellings of one label meet. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .join(' ');
}

/** The name a read gives its product, or null when its label could not be read. */
export function readName(read: ShelfRead): string | null {
  const spoken = read.spoken.trim();
  if (read.verdict === 'unsure' && read.brand_text === null) {
    return null;
  }
  if (spoken.length > 0) {
    return spoken;
  }
  const printed = [read.brand_text, read.size_text].filter((part): part is string => part !== null && part.trim().length > 0).join(' ');
  return printed.length > 0 ? printed : null;
}

export function noteSeen(name: string, box: ShelfBox, pan: CameraPan | null, now: number): void {
  const key = nameKey(name);
  if (key.length === 0) {
    return;
  }
  const before = seen.get(key);
  seen.delete(key);
  seen.set(key, { name: before?.name ?? name.trim(), count: (before?.count ?? 0) + 1, box, pan, at: now });
  while (seen.size > SEEN_MAX) {
    const oldest = seen.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    seen.delete(oldest);
  }
}

/** Products seen within maxAgeMs, the most read first. */
export function seenProducts(now: number, maxAgeMs: number): SeenProduct[] {
  return [...seen.values()].filter((entry) => now - entry.at <= maxAgeMs).sort((a, b) => b.count - a.count || b.at - a.at);
}

export function seenNames(now: number, maxAgeMs: number, limit: number): string[] {
  return seenProducts(now, maxAgeMs)
    .slice(0, limit)
    .map((entry) => entry.name);
}

/** The inventory belongs to one search, named by its epoch and product: another search starts it afresh. */
export function seenFor(search: string): void {
  if (search !== owner) {
    seen.clear();
    owner = search;
  }
}

export function forgetSeen(): void {
  seen.clear();
  owner = '';
}
