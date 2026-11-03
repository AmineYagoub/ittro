// Guide sentences with names in them: the first direction, the
// several-matches line, the wrong-product naming and the lost target.
// DESIGN.md word for word in English; counts and names computed in.
// Arabic and French await a native-speaker review.
import type { SpeechPart } from '../conversation/types';
import type { Language } from '../theme';
import { cueText } from '../voiceClips';
import { arabicProducts, countWord } from '../shelf/searchLines';
import type { GuideDir } from './types';

export const GUIDE_CLUSTER_BOTTOM = 150;

export const GUIDE_CAPTION_GAP = 24;

const DIR_WORD: Record<GuideDir, Record<Language, string>> = {
  right: { en: 'to your right', ar: 'إلى يمينك', fr: 'à votre droite' },
  left: { en: 'to your left', ar: 'إلى يسارك', fr: 'à votre gauche' },
  up: { en: 'above you', ar: 'فوقك', fr: 'au-dessus de vous' },
  down: { en: 'below you', ar: 'تحتك', fr: 'au-dessous de vous' },
};

export function dirOfCue(cue: string): GuideDir {
  if (cue.includes('left')) {
    return 'left';
  }
  if (cue.includes('up')) {
    return 'up';
  }
  if (cue.includes('down')) {
    return 'down';
  }
  return 'right';
}

export function whereSentence(product: string, dir: GuideDir, lang: Language): string {
  if (lang === 'ar') {
    return `${product} ${DIR_WORD[dir].ar}.`;
  }
  if (lang === 'fr') {
    return `${product} est ${DIR_WORD[dir].fr}.`;
  }
  return `${product} is ${DIR_WORD[dir].en}.`;
}

export function firstSentence(product: string, cue: string, lang: Language): string {
  return whereSentence(product, dirOfCue(cue), lang);
}

export function foundToLine(product: string, dir: GuideDir, lang: Language): string {
  if (lang === 'ar') {
    return `وجدت ${product} ${DIR_WORD[dir].ar}.`;
  }
  if (lang === 'fr') {
    return `J’ai trouvé ${product} ${DIR_WORD[dir].fr}.`;
  }
  return `I found ${product} ${DIR_WORD[dir].en}.`;
}

// Where to move the hand follows this line, so it names no spot of its
// own: t20 said "the nearest, on the left. Guedila is to your right"
// (the product sat left of the frame, right of the hand). Arabic counts
// with its own words, never "أرى 2 قديلة منتجات".
export function severalPrefix(count: number, product: string, kind: string, lang: Language): string {
  if (lang === 'ar') {
    return `أرى ${arabicProducts(count)} من ${product}. أرشدك إلى ${count === 2 ? 'أقربهما' : 'أقربها'}.`;
  }
  const amount = countWord(count, lang);
  if (lang === 'fr') {
    return `Je vois ${amount} ${kind} ${product}. Je vous guide vers le plus proche.`;
  }
  return `I see ${amount} ${product} ${kind}. Guiding you to the nearest one.`;
}

export function thisIsLine(label: string, lang: Language): string {
  if (lang === 'ar') {
    return `هذا ${label}.`;
  }
  if (lang === 'fr') {
    return `Ceci est ${label}.`;
  }
  return `This is ${label}.`;
}

export function outOfViewLine(product: string, lang: Language): string {
  if (lang === 'ar') {
    return `${product} خارج الصورة.`;
  }
  if (lang === 'fr') {
    return `${product} est hors de vue.`;
  }
  return `${product} is out of view.`;
}

export function partText(part: SpeechPart, lang: Language): string {
  if ('text' in part) {
    return part.text;
  }
  return cueText[part.clip]?.[lang] ?? '';
}

export function partsText(parts: SpeechPart[], lang: Language): string {
  return parts
    .map((part) => partText(part, lang))
    .filter((text) => text.length > 0)
    .join(' ');
}
