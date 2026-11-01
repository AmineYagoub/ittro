// Shared shapes of the relay's photo routes: the JSON bodies the
// phone posts and the field readers that reject anything but a
// non-empty string before Meta is ever called, and the capped hints
// a question about the view carries. A body over 4 million characters
// (a full photo is about 400 thousand) or one that is not a JSON object
// reads as empty, so its route answers 400; text that goes into a
// prompt is cut to a length a spoken sentence never needs.
import type { AskExchange, AskHints } from './askView.ts';

export interface OutlineBody {
  image?: unknown;
  mime?: unknown;
  phrase?: unknown;
  w?: unknown;
  h?: unknown;
}

export interface PhraseBody {
  request?: unknown;
  image?: unknown;
  mime?: unknown;
  language?: unknown;
}

export interface ReadBody {
  request?: unknown;
  crops?: unknown;
  effort?: unknown;
}

export function effortField(value: unknown): string {
  return value === 'low' ? 'low' : 'minimal';
}

export function textField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function mimeField(value: unknown): string {
  return value === 'image/png' ? 'image/png' : 'image/jpeg';
}

const BODY_MAX_CHARS = 4_000_000;

/** The request's JSON object, or an empty one when the body is too big, not JSON, or not an object. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text().catch(() => '');
  if (text.length === 0 || text.length > BODY_MAX_CHARS) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const HISTORY_MAX = 4;
const INVENTORY_MAX = 12;
const TURN_TEXT_MAX = 400;
const NAME_MAX = 80;

/** A non-empty string, trimmed and cut to max characters, or null. */
export function shortText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;
}

/** The hints a question carries, each checked and capped: anything malformed is dropped, never passed on. */
export function askFields(record: Record<string, unknown>): AskHints {
  const language = record['language'] === 'ar' || record['language'] === 'fr' ? record['language'] : 'en';
  const turns = Array.isArray(record['history']) ? record['history'] : [];
  const history: AskExchange[] = [];
  for (const turn of turns.slice(-HISTORY_MAX)) {
    const entry = (turn ?? {}) as Record<string, unknown>;
    const shopper = shortText(entry['shopper'], TURN_TEXT_MAX);
    const ittro = shortText(entry['ittro'], TURN_TEXT_MAX);
    if (shopper && ittro) {
      history.push({ shopper, ittro });
    }
  }
  const names = Array.isArray(record['inventory']) ? record['inventory'] : [];
  const inventory = names
    .map((name) => shortText(name, NAME_MAX))
    .filter((name): name is string => name !== null)
    .slice(0, INVENTORY_MAX);
  return { language, history, inventory, upset: record['upset'] === true, brief: record['brief'] === true };
}
