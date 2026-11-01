// One voice per language (decision record 0001, voice A): the most
// natural voice the phone has installed, picked when the language
// warms and logged, so a phone run shows which voice spoke. Enhanced
// and network voices come first, then an Algerian or Maghreb Arabic
// one. A picked voice that fails is dropped for the phone's default.
import type { Language } from './theme';

export interface InstalledVoice {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}

const MAGHREB = ['ar-dz', 'ar-ma', 'ar-tn', 'ar-ly'];

const picked: Partial<Record<Language, string | null>> = {};

/** How natural a voice should sound for the language; below zero it does not speak it. */
export function voiceScore(voice: InstalledVoice, lang: Language): number {
  const locale = voice.language.toLowerCase().replace('_', '-');
  if (!locale.startsWith(lang)) {
    return -1;
  }
  const id = voice.identifier.toLowerCase();
  let score = 0;
  if (voice.quality === 'Enhanced') {
    score += 4;
  }
  if (id.includes('network')) {
    score += 2;
  }
  if (lang === 'ar' && MAGHREB.some((code) => locale.startsWith(code))) {
    score += 3;
  }
  return score;
}

/** The best installed voice for the language, or null to keep the phone's default. */
export function pickVoice(voices: InstalledVoice[], lang: Language): InstalledVoice | null {
  let best: InstalledVoice | null = null;
  let bestScore = 0;
  for (const voice of voices) {
    const score = voiceScore(voice, lang);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

export function keepVoice(lang: Language, voice: InstalledVoice | null): void {
  picked[lang] = voice ? voice.identifier : null;
}

/** The identifier to speak the language with, when one was picked. */
export function pickedVoice(lang: Language): string | undefined {
  return picked[lang] ?? undefined;
}

/** After a failed line: the language goes back to the phone's default voice. */
export function dropVoice(lang: Language): boolean {
  if (!picked[lang]) {
    return false;
  }
  picked[lang] = null;
  return true;
}
