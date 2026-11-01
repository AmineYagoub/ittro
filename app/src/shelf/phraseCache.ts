// The shelf phrase SAM outlines with ("bottle", "carton") depends on the
// product, not the photo, so it is kept across searches and launches:
// asking Spark again cost about 2 s at the start of every search (t8
// +2.8 to +4.7). At most 50 products, newest kept.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logIttro } from '../log';

const KEY = 'ittro.packagePhrases.v1';
const MAX = 50;

const cache = new Map<string, string>();
let loading: Promise<void> | null = null;

function keyOf(request: string): string {
  return request.trim().toLowerCase();
}

function load(): Promise<void> {
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as [string, string][]) : [];
      for (const [request, phrase] of saved) {
        if (typeof request === 'string' && typeof phrase === 'string' && !cache.has(request)) {
          cache.set(request, phrase);
        }
      }
    } catch {
      // A broken store only costs one fresh phrase.
    }
  })();
  return loading;
}

function save(): void {
  void AsyncStorage.setItem(KEY, JSON.stringify([...cache.entries()].slice(-MAX))).catch(() => undefined);
}

export async function cachedPhrase(
  request: string,
  image: string,
  mime: string,
  fetchPhrase: (request: string, image: string, mime: string) => Promise<string>,
): Promise<string> {
  await load();
  const key = keyOf(request);
  const known = cache.get(key);
  if (known) {
    logIttro(`package phrase cached "${known}"`);
    return known;
  }
  const phrase = await fetchPhrase(request, image, mime);
  rememberPhrase(request, phrase);
  return phrase;
}

/** The phrase SAM answered to for this product, kept in place of the one asked. */
export function rememberPhrase(request: string, phrase: string): void {
  const key = keyOf(request);
  cache.delete(key);
  cache.set(key, phrase);
  while (cache.size > MAX) {
    cache.delete(cache.keys().next().value as string);
  }
  save();
}

export function forgetPhrasesForTest(): void {
  cache.clear();
  loading = null;
}
