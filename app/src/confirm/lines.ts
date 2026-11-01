// Confirm lines: screens 07 to 11. The English lines are DESIGN.md
// word for word; every name, count, read value and unreadable part
// is computed into them, never fixed. Arabic and French await a
// native-speaker review.
import type { Language } from '../theme';
import type { ConfirmAttr, DetailKind, DetailReason, PictureProblem } from '../relay';

export function verdictWord(verdict: 'yes' | 'no' | 'unsure', lang: Language): string {
  if (verdict === 'yes') {
    return lang === 'ar' ? 'نعم' : lang === 'fr' ? 'Oui' : 'Yes';
  }
  if (verdict === 'no') {
    return lang === 'ar' ? 'لا' : lang === 'fr' ? 'Non' : 'No';
  }
  return lang === 'ar' ? 'ربما' : lang === 'fr' ? 'Peut-être' : 'Maybe';
}

export function yesNext(lang: Language): string {
  if (lang === 'ar') {
    return 'قل ابحث عن غيره، أو انتهيت.';
  }
  if (lang === 'fr') {
    return 'Dites cherchez un autre, ou c’est fini.';
  }
  return 'Say find another, or done.';
}

/** The 8 s reminder after a verdict: a yes is not said again, only the choice that followed it. */
export function verdictReprompt(lastLine: string, lang: Language): string {
  const next = yesNext(lang);
  return lastLine.endsWith(next) ? next : lastLine;
}

export function backToShelfLine(lang: Language): string {
  if (lang === 'ar') {
    return 'سأبحث عنه على الرف.';
  }
  if (lang === 'fr') {
    return 'Je vais le chercher dans le rayon.';
  }
  return "I'll look for it on the shelf.";
}

export function attrName(attr: ConfirmAttr, lang: Language): string {
  if (lang === 'ar') {
    return attr === 'brand' ? 'العلامة التجارية' : attr === 'product' ? 'المنتج' : attr === 'variant' ? 'النوع' : 'الحجم';
  }
  if (lang === 'fr') {
    return attr === 'brand' ? 'la marque' : attr === 'product' ? 'le produit' : attr === 'variant' ? 'la variante' : 'la taille';
  }
  return attr === 'brand' ? 'the brand' : attr === 'product' ? 'the product' : attr === 'variant' ? 'the variant' : 'the size';
}

function joinList(words: string[], lang: Language): string {
  if (words.length <= 1) {
    return words[0] ?? '';
  }
  const glue = lang === 'ar' ? ' و ' : lang === 'fr' ? ' et ' : ' and ';
  const sep = lang === 'ar' ? '، ' : ', ';
  return `${words.slice(0, -1).join(sep)}${glue}${words[words.length - 1]}`;
}

export function turnSlowly(lang: Language): string {
  if (lang === 'ar') {
    return 'أدره ببطء.';
  }
  if (lang === 'fr') {
    return 'Tournez-le lentement.';
  }
  return 'Turn it slowly.';
}

export function unsureBody(read: string[], missing: ConfirmAttr[], lang: Language): string {
  const turn = turnSlowly(lang);
  const unread = joinList(missing.map((attr) => attrName(attr, lang)), lang);
  if (read.length === 0) {
    if (lang === 'ar') {
      return `لا أستطيع قراءة ${unread} بعد. ${turn}`;
    }
    if (lang === 'fr') {
      return `Je ne peux pas encore lire ${unread}. ${turn}`;
    }
    return `I can't read ${unread} yet. ${turn}`;
  }
  const have = joinList(read, lang);
  if (lang === 'ar') {
    return `أستطيع قراءة ${have}، لكن ليس ${unread}. ${turn}`;
  }
  if (lang === 'fr') {
    return `Je peux lire ${have}, mais pas ${unread}. ${turn}`;
  }
  return `I can read ${have}, but not ${unread}. ${turn}`;
}

export function giveupLine(missing: ConfirmAttr[], lang: Language): string {
  const unread = joinList((missing.length > 0 ? missing : (['product'] as ConfirmAttr[])).map((attr) => attrName(attr, lang)), lang);
  if (lang === 'ar') {
    return `لا أستطيع قراءة ${unread}. حاول تقريبه أكثر.`;
  }
  if (lang === 'fr') {
    return `Je ne peux pas lire ${unread}. Essayez de le tenir plus près.`;
  }
  return `I can't read ${unread}. Try holding it closer.`;
}

export function pictureLine(problem: PictureProblem, lang: Language): string {
  if (lang === 'ar') {
    if (problem === 'blurry') return 'الملصق ضبابي. ثبت الهاتف لثانية.';
    if (problem === 'dark') return 'المكان مظلم هنا. اقترب من الضوء.';
    if (problem === 'glare') return 'هناك انعكاس. أمل المنتج قليلًا.';
    if (problem === 'far') return 'قرّبه من الهاتف.';
    return 'أدره بحيث يواجه الملصق الهاتف.';
  }
  if (lang === 'fr') {
    if (problem === 'blurry') return 'L’étiquette est floue. Gardez le téléphone immobile une seconde.';
    if (problem === 'dark') return 'Il fait trop sombre ici. Rapprochez-vous de la lumière.';
    if (problem === 'glare') return 'Il y a un reflet. Inclinez un peu le produit.';
    if (problem === 'far') return 'Rapprochez-le du téléphone.';
    return 'Tournez-le pour que l’étiquette soit face au téléphone.';
  }
  if (problem === 'blurry') return 'The label is blurry. Hold the phone still for a second.';
  if (problem === 'dark') return "It's too dark here. Move closer to the light.";
  if (problem === 'glare') return "There's a reflection. Tilt the product a little.";
  if (problem === 'far') return 'Bring it closer to the phone.';
  return 'Turn it so the label faces the phone.';
}

export function movedLine(lang: Language): string {
  if (lang === 'ar') {
    return 'تحركت يدك. أبقها على المنتج لأستطيع قراءته.';
  }
  if (lang === 'fr') {
    return 'Votre main a bougé. Gardez-la sur le produit pour que je puisse le lire.';
  }
  return 'Your hand moved. Keep it on the product so I can read it.';
}

export function detailName(kind: DetailKind, lang: Language): string {
  if (lang === 'ar') {
    return kind === 'date' ? 'التاريخ' : kind === 'size' ? 'الحجم' : kind === 'price' ? 'السعر' : 'المكونات';
  }
  if (lang === 'fr') {
    return kind === 'date' ? 'la date' : kind === 'size' ? 'la taille' : kind === 'price' ? 'le prix' : 'les ingrédients';
  }
  return kind;
}

function endDot(text: string): string {
  return /[.?!…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

export function detailSays(kind: DetailKind, text: string, lang: Language): string {
  const quoted = endDot(text);
  if (lang === 'ar') {
    return `${detailName(kind, lang)} يقول: ${quoted}`;
  }
  if (lang === 'fr') {
    return `${detailName(kind, lang)} dit : ${quoted}`;
  }
  return `The ${kind} says: ${quoted}`;
}

export function cantReadKind(kind: DetailKind, lang: Language): string {
  if (lang === 'ar') {
    return `لا أستطيع قراءة ${detailName(kind, lang)}.`;
  }
  if (lang === 'fr') {
    return `Je ne peux pas lire ${detailName(kind, lang)}.`;
  }
  return `I can't read the ${kind}.`;
}

export function detailReason(reason: DetailReason | null, lang: Language): string {
  if (lang === 'ar') {
    if (reason === 'too_small') return 'الطباعة صغيرة جدًا.';
    if (reason === 'blurry') return 'الملصق ضبابي.';
    if (reason === 'dark') return 'المكان مظلم هنا.';
    if (reason === 'glare') return 'هناك انعكاس.';
    if (reason === 'turned') return 'الملصق مدبَر.';
    if (reason === 'not_visible') return 'لا أراه على الملصق.';
    return 'لا أراه بوضوح.';
  }
  if (lang === 'fr') {
    if (reason === 'too_small') return 'L’impression est trop petite.';
    if (reason === 'blurry') return 'L’étiquette est floue.';
    if (reason === 'dark') return 'Il fait trop sombre ici.';
    if (reason === 'glare') return 'Il y a un reflet.';
    if (reason === 'turned') return 'L’étiquette est tournée.';
    if (reason === 'not_visible') return 'Je ne le vois pas sur l’étiquette.';
    return 'Je ne le vois pas clairement.';
  }
  if (reason === 'too_small') return 'The print is too small.';
  if (reason === 'blurry') return 'The label is blurry.';
  if (reason === 'dark') return "It's too dark here.";
  if (reason === 'glare') return "There's a reflection.";
  if (reason === 'turned') return 'The label is turned away.';
  if (reason === 'not_visible') return "I can't see it on the label.";
  return "I can't see it clearly.";
}

export function detailAction(reason: DetailReason | null, lang: Language): string {
  if (reason === 'blurry') {
    return lang === 'ar' ? 'ثبت الهاتف لثانية.' : lang === 'fr' ? 'Gardez le téléphone immobile une seconde.' : 'Hold the phone still for a second.';
  }
  if (reason === 'dark') {
    return lang === 'ar' ? 'اقترب من الضوء.' : lang === 'fr' ? 'Rapprochez-vous de la lumière.' : 'Move closer to the light.';
  }
  if (reason === 'glare') {
    return lang === 'ar' ? 'أمل المنتج قليلًا.' : lang === 'fr' ? 'Inclinez un peu le produit.' : 'Tilt the product a little.';
  }
  if (reason === 'turned') {
    return lang === 'ar' ? 'أدره بحيث يواجه الملصق الهاتف.' : lang === 'fr' ? 'Tournez-le pour que l’étiquette soit face au téléphone.' : 'Turn it so the label faces the phone.';
  }
  return lang === 'ar' ? 'قرّبه أكثر.' : lang === 'fr' ? 'Rapprochez-le.' : 'Bring it closer.';
}

export function detailMiss(kind: DetailKind, reason: DetailReason | null, lang: Language): string {
  return `${cantReadKind(kind, lang)} ${detailReason(reason, lang)} ${detailAction(reason, lang)}`;
}
