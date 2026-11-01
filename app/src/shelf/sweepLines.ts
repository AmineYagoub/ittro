// The sweep's spoken lines (plan part 4): the first says the product
// is not in view here and where to turn; then each step, stop, slower
// and the walk along the shelf. "I checked the whole shelf" is said
// only when the sweep really covered the reach; the not-here summary
// without an offer ends with what the shopper can say next.
import type { Language } from '../theme';
import type { SweepCue } from './sweep';

const LINES: Record<Exclude<SweepCue, 'start'>, Record<Language, string>> = {
  right: { ar: 'أدر الهاتف ببطء إلى اليمين.', fr: 'Tournez lentement le téléphone vers la droite.', en: 'Turn the phone slowly to the right.' },
  left: { ar: 'الآن أدره ببطء إلى اليسار.', fr: 'Maintenant, tournez-le lentement vers la gauche.', en: 'Now turn it slowly to the left.' },
  down: { ar: 'أمِل الهاتف ببطء إلى الأسفل.', fr: 'Inclinez lentement le téléphone vers le bas.', en: 'Tilt the phone slowly down.' },
  stop: { ar: 'توقف.', fr: 'Stop.', en: 'Stop.' },
  slower: { ar: 'أبطأ قليلًا.', fr: 'Plus lentement.', en: 'Slower.' },
  walkRight: {
    ar: 'خذ خطوتين إلى اليمين، ثم وجّه الهاتف نحو الرف من جديد.',
    fr: 'Faites deux pas vers la droite, puis pointez le téléphone vers le rayon.',
    en: 'Take two steps to the right, then point the phone at the shelf again.',
  },
  walkLeft: {
    ar: 'خذ خطوتين إلى اليسار، ثم وجّه الهاتف نحو الرف من جديد.',
    fr: 'Faites deux pas vers la gauche, puis pointez le téléphone vers le rayon.',
    en: 'Take two steps to the left, then point the phone at the shelf again.',
  },
};

export function sweepLine(cue: SweepCue, product: string, lang: Language): string {
  if (cue !== 'start') {
    return LINES[cue][lang];
  }
  if (lang === 'ar') {
    return `لا أرى ${product} هنا. ${LINES.right.ar}`;
  }
  if (lang === 'fr') {
    return `Je ne vois pas ${product} ici. ${LINES.right.fr}`;
  }
  return `I don't see ${product} here. ${LINES.right.en}`;
}

export function wholeShelfLine(lang: Language): string {
  if (lang === 'ar') {
    return 'فحصت الرف كله.';
  }
  if (lang === 'fr') {
    return 'J’ai vérifié tout le rayon.';
  }
  return 'I checked the whole shelf.';
}

export function notHereNextLine(lang: Language): string {
  if (lang === 'ar') {
    return 'قل واصل البحث، أو ابحث عن غيره، أو اسأل شخصًا.';
  }
  if (lang === 'fr') {
    return 'Dites continuez à chercher, cherchez un autre, ou demandez à quelqu’un.';
  }
  return 'Say keep looking, find another, or ask someone.';
}

export function notHereOfferLine(offer: string, lang: Language): string {
  if (lang === 'ar') {
    return `هل تريد ${offer}؟`;
  }
  if (lang === 'fr') {
    return `Voulez-vous ${offer} ?`;
  }
  return `Do you want ${offer}?`;
}
