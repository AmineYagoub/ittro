// Guide sentences with names in them: the first direction, the
// several-matches line, the wrong-product naming and the lost target.
// DESIGN.md word for word in English; counts and names computed in.
// Arabic and French await a native-speaker review.
import type { GuidePosition, SpeechPart } from '../conversation/types';
import type { Language } from '../theme';
import { cueText } from '../voiceClips';
import { countWord } from '../shelf/searchLines';
import type { ViewBox } from '../shelf/outlines';
import type { GuideDir } from './types';

export const GUIDE_CLUSTER_BOTTOM = 150;

export const GUIDE_CAPTION_GAP = 24;

const DIR_WORD: Record<GuideDir, Record<Language, string>> = {
  right: { en: 'to your right', ar: 'إلى يمينك', fr: 'à votre droite' },
  left: { en: 'to your left', ar: 'إلى يسارك', fr: 'à votre gauche' },
  up: { en: 'above you', ar: 'فوقك', fr: 'au-dessus de vous' },
  down: { en: 'below you', ar: 'تحتك', fr: 'au-dessous de vous' },
};

const SPOT_WORD: Record<GuidePosition, Record<Language, string>> = {
  left: { en: 'on the left', ar: 'على اليسار', fr: 'à gauche' },
  middle: { en: 'in the middle', ar: 'في الوسط', fr: 'au milieu' },
  right: { en: 'on the right', ar: 'على اليمين', fr: 'à droite' },
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

export function severalPrefix(count: number, product: string, kind: string, position: GuidePosition, lang: Language): string {
  const amount = countWord(count, lang);
  if (lang === 'ar') {
    return `أرى ${amount} ${product} ${kind}. أرشدك إلى أقربها، ${SPOT_WORD[position].ar}.`;
  }
  if (lang === 'fr') {
    return `Je vois ${amount} ${product} ${kind}. Je vous guide vers le plus proche, ${SPOT_WORD[position].fr}.`;
  }
  return `I see ${amount} ${product} ${kind}. Guiding you to the nearest one, ${SPOT_WORD[position].en}.`;
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

export const PILL_MAX_WIDTH = 280;

const PILL_MARGIN = 8;

const PILL_ABOVE_GAP = 44;

export interface PillBox {
  left: number;
  top: number;
}

// The pill centred over the outline's cap, as ~/ittro/native drew
// it; its width is guessed from the label, about 9 dp a letter.
export function capPill(cap: { x: number; y: number }, box: ViewBox, label: string, width: number, height: number): PillBox {
  const guess = Math.min(PILL_MAX_WIDTH, label.length * 9 + 28);
  const left = Math.round(Math.min(Math.max(PILL_MARGIN, cap.x - guess / 2), Math.max(PILL_MARGIN, width - guess - PILL_MARGIN)));
  const top = cap.y >= PILL_ABOVE_GAP + 4 ? cap.y - PILL_ABOVE_GAP : Math.min(height - 48, box.top + box.height + 8);
  return { left, top };
}

export function pillBox(box: ViewBox, width: number, height: number): PillBox {
  const left = Math.min(Math.max(PILL_MARGIN, box.left), Math.max(PILL_MARGIN, width - PILL_MAX_WIDTH - PILL_MARGIN));
  const top = box.top >= PILL_ABOVE_GAP + 4 ? box.top - PILL_ABOVE_GAP : Math.min(height - 48, box.top + box.height + 8);
  return { left, top };
}
