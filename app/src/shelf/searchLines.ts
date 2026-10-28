// Shelf search lines: screens 04, 05, 22, 27 and 28. The English lines
// are DESIGN.md word for word; counts are computed into them, never
// fixed. Arabic and French await a native-speaker review.
import type { Language } from '../theme';

type Direction = 'left' | 'right';

const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function countWord(count: number, lang: Language): string {
  if (lang === 'en' && count >= 1 && count <= COUNT_WORDS.length) {
    return COUNT_WORDS[count - 1] as string;
  }
  return String(count);
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function searchingLine(product: string, direction: Direction, lang: Language): string {
  if (lang === 'ar') {
    const way = direction === 'right' ? 'إلى اليمين' : 'إلى اليسار';
    return `لا أرى ${product} بعد. أدر الهاتف ببطء ${way}.`;
  }
  if (lang === 'fr') {
    const way = direction === 'right' ? 'vers la droite' : 'vers la gauche';
    return `Je ne vois pas encore ${product}. Tournez lentement le téléphone ${way}.`;
  }
  return `I don't see ${product} yet. Turn the phone slowly to your ${direction}.`;
}

export function shelfSweptLine(checked: number, product: string, lang: Language): string {
  const count = countWord(checked, lang);
  if (lang === 'ar') {
    return `فحصت ${count} من المنتجات. ${product} ليس هنا. قل واصل البحث، أو ابحث عن غيره.`;
  }
  if (lang === 'fr') {
    return `J'ai vérifié ${count} produits. ${product} n'est pas là. Dites continuez à chercher, ou cherchez un autre.`;
  }
  return `I checked ${count} products. ${product} isn't here. Say keep looking, or find another.`;
}

export function readingLine(count: number, kind: string, lang: Language): string {
  const amount = countWord(count, lang);
  if (lang === 'ar') {
    return `أرى ${amount} ${kind}. أقرأ ملصقاتها. ثبت الهاتف.`;
  }
  if (lang === 'fr') {
    return `Je vois ${amount} ${kind}. Je lis leurs étiquettes. Tenez le téléphone immobile.`;
  }
  return `I see ${amount} ${kind}. Reading their labels. Hold the phone steady.`;
}

export function stillReadingLine(remaining: number, lang: Language): string {
  const amount = countWord(remaining, lang);
  if (lang === 'ar') {
    return `ما زلت أقرأ. بقي ${amount} من الملصقات.`;
  }
  if (lang === 'fr') {
    return `Je lis toujours. Il reste ${amount} étiquette.`;
  }
  return `Still reading. ${amount} ${plural(remaining, 'label', 'labels')} left.`;
}

export function holdPhoneLine(lang: Language, pointsAtFloor: boolean): string {
  const hold =
    lang === 'ar'
      ? 'امسك الهاتف على ارتفاع الصدر، والكاميرا نحو الرف، على بعد ذراع تقريبًا.'
      : lang === 'fr'
        ? 'Tenez le téléphone à hauteur de poitrine, caméra vers le rayon, à environ un bras de distance.'
        : 'Hold the phone at chest height, camera toward the shelf, about an arm away.';
  if (!pointsAtFloor) {
    return hold;
  }
  if (lang === 'ar') {
    return `الكاميرا تشير إلى الأرض. ${hold}`;
  }
  if (lang === 'fr') {
    return `La caméra pointe vers le sol. ${hold}`;
  }
  return `The camera points at the floor. ${hold}`;
}

export function closeMatchLine(wanted: string, found: string, lang: Language): string {
  if (lang === 'ar') {
    return `${wanted} ليس هنا. أرى ${found}. هل تريد هذا؟`;
  }
  if (lang === 'fr') {
    return `${wanted} n'est pas là. Je vois ${found}. Voulez-vous celui-là ?`;
  }
  return `${wanted} isn't here. I see ${found}. Do you want that one?`;
}

export function wrongShelfLine(kind: string, aisle: string, lang: Language): string {
  if (lang === 'ar') {
    return `لا أرى أي ${kind} هنا. اسأل أحد العاملين عن ${aisle}، أو قل اسأل شخصًا.`;
  }
  if (lang === 'fr') {
    return `Je ne vois aucun ${kind} ici. Demandez à un employé pour ${aisle}, ou dites demandez à quelqu’un.`;
  }
  return `I don't see any ${kind} here. Ask a staff member for ${aisle}, or say ask someone.`;
}

export function searchingStatusLine(product: string, checked: number, lang: Language): string {
  if (lang === 'ar') {
    return `أبحث في الرف عن ${product}. فحصت ${checked} حتى الآن.`;
  }
  if (lang === 'fr') {
    return `Je cherche ${product} dans le rayon. ${checked} vérifiés pour l’instant.`;
  }
  return `I'm searching the shelf for ${product}. ${checked} products checked so far.`;
}

export function checkingLine(lang: Language): string {
  if (lang === 'ar') {
    return 'أتحقق.';
  }
  if (lang === 'fr') {
    return 'Je vérifie.';
  }
  return "I'm checking.";
}

export function shelfFoundLine(product: string, lang: Language): string {
  if (lang === 'ar') {
    return `وجدت ${product} على الرف. إرشاد اليد هو الخطوة التالية.`;
  }
  if (lang === 'fr') {
    return `J'ai trouvé ${product} dans le rayon. Guider votre main vient ensuite.`;
  }
  return `I found ${product} on the shelf. Guiding your hand comes next.`;
}
