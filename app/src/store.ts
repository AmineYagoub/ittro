// Shopper preferences, remembered between launches and never reset by
// updates: the language, whether the first launch finished, and the
// verbosity and speed the shopper chose.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Language } from './theme';
import { speech } from './theme';

const KEY = 'ittro.prefs.v1';

export interface Prefs {
  language: Language;
  firstLaunchDone: boolean;
  brief: boolean;
  rate: number;
}

const DEFAULTS: Prefs = {
  language: speech.defaultLanguage,
  firstLaunchDone: false,
  brief: false,
  rate: 1,
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
    return { language, firstLaunchDone: parsed.firstLaunchDone === true, brief: parsed.brief === true, rate };
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

export async function loadSnapshot(): Promise<ConversationSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) {
      return { request: null };
    }
    const parsed = JSON.parse(raw) as Partial<ConversationSnapshot>;
    return { request: typeof parsed.request === 'string' ? parsed.request : null };
  } catch {
    return { request: null };
  }
}

export async function saveSnapshot(snapshot: ConversationSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // The snapshot is a convenience; the session continues without it.
  }
}
