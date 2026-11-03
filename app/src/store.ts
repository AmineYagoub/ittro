// Shopper preferences, remembered between launches and never reset by
// updates: the language, whether the first launch finished, the
// verbosity and speed the shopper chose, helpers, and confirmed
// brand words the mic listens for next time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Language } from './theme';
import { speech } from './theme';

const KEY = 'ittro.prefs.v1';

export interface HelperPref {
  name: string;
  token: string;
}

export interface Prefs {
  language: Language;
  firstLaunchDone: boolean;
  brief: boolean;
  rate: number;
  helpers: HelperPref[];
  brands: string[];
}

const DEFAULTS: Prefs = {
  language: speech.defaultLanguage,
  firstLaunchDone: false,
  brief: false,
  rate: 1,
  helpers: [],
  brands: [],
};

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return { ...DEFAULTS };
    }
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const language: Language =
      parsed.language === 'ar' || parsed.language === 'fr' ? parsed.language : 'en';
    const rate = typeof parsed.rate === 'number' ? Math.min(2, Math.max(0.5, parsed.rate)) : 1;
    const helpers = Array.isArray(parsed.helpers)
      ? parsed.helpers.filter((helper) => typeof helper?.name === 'string' && typeof helper?.token === 'string')
      : [];
    const brands = Array.isArray(parsed.brands) ? parsed.brands.filter((word) => typeof word === 'string').slice(-20) : [];
    return { language, firstLaunchDone: parsed.firstLaunchDone === true, brief: parsed.brief === true, rate, helpers, brands };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience; the session continues without them.
  }
}

const SNAPSHOT_KEY = 'ittro.conversation.v1';

export interface ConversationSnapshot {
  request: string | null;
}

export async function saveSnapshot(snapshot: ConversationSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // The snapshot is a convenience; the session continues without it.
  }
}
