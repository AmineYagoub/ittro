// Warming the speech engine for a language: the first line in a
// new language can take seconds while the engine loads its voice,
// so the app pings the engine on every language switch, and picks
// the language's most natural installed voice (voicePick.ts). Silent
// and fire-and-forget; a failure just warms again next time.
import * as Speech from 'expo-speech';
import type { Language } from './theme';
import { logIttro } from './log';
import { keepVoice, pickVoice } from './voicePick';

let warmedLang: Language | null = null;

export function warmVoice(lang: Language): void {
  if (warmedLang === lang) {
    return;
  }
  warmedLang = lang;
  void Speech.getAvailableVoicesAsync().then(
    (voices) => {
      const count = voices.filter((voice) => voice.language.startsWith(lang)).length;
      const best = pickVoice(voices, lang);
      keepVoice(lang, best);
      logIttro(`voice ready ${lang} (${count} voices) ${best ? `speaking with ${best.identifier} ${best.quality}` : 'speaking with the default voice'}`);
    },
    () => {
      warmedLang = null;
    },
  );
}
