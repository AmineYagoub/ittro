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
}

const DEFAULTS: Prefs = {
  language: speech.defaultLanguage,
  firstLaunchDone: false,
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
    return { language, firstLaunchDone: parsed.firstLaunchDone === true };
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
