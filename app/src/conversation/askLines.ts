// The fixed lines around a question about the view: the short
// acknowledgement that plays as the question ends (picked at random so
// it never sounds canned), the offer to take the shopper to what the
// answer named, and the lines when there is no picture or no answer.
// The answers themselves are Muse Spark's words (decision record 0001).
import type { Language } from '../theme';

const ACKS: Record<Language, string[]> = {
  ar: ['لحظة…', 'نشوف…', 'خليني نشوف…'],
  fr: ['Voyons…', 'Un instant…', 'Je regarde…'],
  en: ['Let me look…', 'One moment…', 'Let me see…'],
};

export function ackLine(lang: Language, pick: number): string {
  const lines = ACKS[lang];
  return lines[Math.abs(Math.floor(pick * lines.length)) % lines.length] as string;
}

export function viewOfferLine(lang: Language): string {
  if (lang === 'ar') {
    return 'هل تريد أن آخذك إليه؟';
  }
  if (lang === 'fr') {
    return 'Voulez-vous que je vous y emmène ?';
  }
  return 'Do you want me to take you to it?';
}

export function pointAtShelfLine(lang: Language): string {
  if (lang === 'ar') {
    return 'وجّه الهاتف نحو الرف.';
  }
  if (lang === 'fr') {
    return 'Tournez le téléphone vers le rayon.';
  }
  return 'Point the phone at the shelf.';
}

export function noStillLine(lang: Language): string {
  if (lang === 'ar') {
    return 'لا أرى الرف. وجّه الهاتف نحوه واسألني من جديد.';
  }
  if (lang === 'fr') {
    return 'Je ne vois pas le rayon. Tournez le téléphone vers lui et redemandez-moi.';
  }
  return "I can't see the shelf. Point the phone at it and ask me again.";
}

export function viewTimeoutLine(lang: Language): string {
  if (lang === 'ar') {
    return 'لم أستطع الإجابة في الوقت. اسألني مرة أخرى.';
  }
  if (lang === 'fr') {
    return 'Je n’ai pas pu répondre à temps. Redemandez-moi.';
  }
  return "I couldn't answer in time. Ask me again.";
}

export function viewDeclinedLine(lang: Language): string {
  if (lang === 'ar') {
    return 'حسنًا.';
  }
  if (lang === 'fr') {
    return 'D’accord.';
  }
  return 'All right.';
}
