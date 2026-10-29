// Helper lines: pairing, asking, waiting and answers. The English
// lines are DESIGN.md word for word where the design gives them;
// Arabic and French await a native-speaker review.
import type { Language } from '../theme';

type Trilingual = Record<Language, string>;

export function spacedCode(code: string): string {
  return code.split('').join(' ');
}

export function joinNames(names: string[], lang: Language): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  const and = lang === 'ar' ? 'و' : lang === 'fr' ? 'et' : 'and';
  if (names.length === 2) {
    return lang === 'ar' ? `${names[0]} ${and}${names[1]}` : `${names[0]} ${and} ${names[1]}`;
  }
  const head = names.slice(0, -1).join(lang === 'ar' ? '، ' : ', ');
  return lang === 'ar' ? `${head} ${and}${names[names.length - 1]}` : `${head} ${and} ${names[names.length - 1]}`;
}

export const askNameLine: Trilingual = {
  en: 'Who do you want to add as a helper?',
  ar: 'من تريد أن تضيف كمساعد؟',
  fr: 'Qui voulez-vous ajouter comme aidant ?',
};

export function pairLine(name: string, code: string, host: string, lang: Language): string {
  const digits = spacedCode(code);
  if (lang === 'ar') {
    return `اطلب من ${name} أن يفتح ${host}/help ويكتب ${digits}. سأنتظر.`;
  }
  if (lang === 'fr') {
    return `Demandez à ${name} d’ouvrir ${host}/help et de taper ${digits}. J’attends.`;
  }
  return `Ask ${name} to open ${host}/help and type ${digits}. I'll wait.`;
}

export const pairFailedLine: Trilingual = {
  en: "I couldn't make a code. Say add a helper to try again.",
  ar: 'لم أستطع إنشاء رمز. قل أضف مساعدًا للمحاولة مرة أخرى.',
  fr: 'Je n’ai pas pu créer de code. Dites ajoutez un aidant pour réessayer.',
};

export const pairExpiredLine: Trilingual = {
  en: 'The code expired. Say add a helper to try again.',
  ar: 'انتهت صلاحية الرمز. قل أضف مساعدًا للمحاولة مرة أخرى.',
  fr: 'Le code a expiré. Dites ajoutez un aidant pour réessayer.',
};

export function joinedLine(name: string, lang: Language): string {
  if (lang === 'ar') {
    return `${name} أصبح مساعدك الآن.`;
  }
  if (lang === 'fr') {
    return `${name} est maintenant votre aidant.`;
  }
  return `${name} is now your helper.`;
}

export function askConfirmLine(target: string, question: string, lang: Language): string {
  if (lang === 'ar') {
    return `سأرسل هذه الصورة وسؤالك إلى ${target}: ${question}؟ قل نعم للإرسال.`;
  }
  if (lang === 'fr') {
    return `Je vais envoyer cette photo et votre question à ${target} : ${question} ? Dites oui pour envoyer.`;
  }
  return `I'll send this picture and your question to ${target}: ${question}? Say yes to send.`;
}

export function helpersWord(lang: Language): string {
  if (lang === 'ar') {
    return 'مساعديك';
  }
  if (lang === 'fr') {
    return 'vos aidants';
  }
  return 'your helpers';
}

export function askQuestionLine(request: string, lang: Language): string {
  if (lang === 'ar') {
    return `هل هذا ${request}`;
  }
  if (lang === 'fr') {
    return `est-ce ${request}`;
  }
  return `is this ${request}`;
}

export const noHelpersLine: Trilingual = {
  en: 'You have no helper yet. Say add a helper.',
  ar: 'ليس لديك مساعد بعد. قل أضف مساعدًا.',
  fr: 'Vous n’avez pas encore d’aidant. Dites ajoutez un aidant.',
};

export function unknownHelperLine(name: string, lang: Language): string {
  if (lang === 'ar') {
    return `${name} ليس مساعدًا بعد. قل أضف مساعدًا لإضافته.`;
  }
  if (lang === 'fr') {
    return `${name} n’est pas encore un aidant. Dites ajoutez un aidant pour l’ajouter.`;
  }
  return `${name} isn't a helper yet. Say add a helper to add them.`;
}

export const nothingToAskLine: Trilingual = {
  en: "There's nothing to ask about yet. Tell me what you're looking for.",
  ar: 'لا يوجد شيء لتسأل عنه بعد. أخبرني عما تبحث عنه.',
  fr: 'Il n’y a encore rien à demander. Dites-moi ce que vous cherchez.',
};

export const sendNoLine: Trilingual = {
  en: "Okay, I won't send it.",
  ar: 'حسنًا، لن أرسله.',
  fr: 'D’accord, je ne l’envoie pas.',
};

export const sendFailedLine: Trilingual = {
  en: "I couldn't send that. Say ask again to try again.",
  ar: 'لم أستطع إرسال ذلك. قل اسأل مرة أخرى للمحاولة.',
  fr: 'Je n’ai pas pu envoyer. Dites redemandez pour réessayer.',
};

export function sentLine(names: string[], lang: Language): string {
  const who = joinNames(names, lang);
  if (lang === 'ar') {
    return `أرسلت إلى ${who}. سأخبرك عندما يجيب. قل إلغاء للتوقف عن الانتظار.`;
  }
  if (lang === 'fr') {
    return `Envoyé à ${who}. Je vous dirai quand il répondra. Dites annulez pour arrêter d’attendre.`;
  }
  return `Sent to ${who}. I'll tell you when they answer. Say cancel to stop waiting.`;
}

export function stillWaitingLine(names: string[], lang: Language): string {
  const who = joinNames(names, lang);
  if (lang === 'ar') {
    return `ما زلت أنتظر ${who}.`;
  }
  if (lang === 'fr') {
    return `J’attends toujours ${who}.`;
  }
  return `Still waiting for ${who}.`;
}

export function timeoutLine(names: string[], lang: Language): string {
  const who = joinNames(names, lang);
  if (lang === 'ar') {
    return `${who} لم يجب. قل اسأل مرة أخرى، أو اقرأ مرة أخرى.`;
  }
  if (lang === 'fr') {
    return `${who} n’a pas répondu. Dites redemandez, ou relisez.`;
  }
  return `${who} hasn't answered. Say ask again, or read again.`;
}

export function cancelledWaitingLine(names: string[], lang: Language): string {
  const who = joinNames(names, lang);
  if (lang === 'ar') {
    return `حسنًا، توقفت عن انتظار ${who}.`;
  }
  if (lang === 'fr') {
    return `D’accord, j’ai arrêté d’attendre ${who}.`;
  }
  return `Okay, I stopped waiting for ${who}.`;
}

export function cancelledPairLine(name: string, lang: Language): string {
  if (lang === 'ar') {
    return `حسنًا، ألغيت إضافة ${name}.`;
  }
  if (lang === 'fr') {
    return `D’accord, j’ai annulé l’ajout de ${name}.`;
  }
  return `Okay, I cancelled adding ${name}.`;
}

export const okayLine: Trilingual = {
  en: 'Okay.',
  ar: 'حسنًا.',
  fr: 'D’accord.',
};

export const nothingToCancelLine: Trilingual = {
  en: "There's nothing to cancel.",
  ar: 'لا يوجد شيء لإلغائه.',
  fr: 'Il n’y a rien à annuler.',
};

export function offerLine(name: string, lang: Language): string {
  if (lang === 'ar') {
    return `هل تريد أن تسأل ${name}؟ قل نعم أو لا.`;
  }
  if (lang === 'fr') {
    return `Voulez-vous demander à ${name} ? Dites oui ou non.`;
  }
  return `Do you want to ask ${name}? Say yes or no.`;
}

export function answerLine(
  verdict: 'yes' | 'no' | 'cant_tell',
  helper: string,
  label: string,
  note: string | null,
  lang: Language,
): string {
  const notePart = note ? (lang === 'ar' ? ` ملاحظة: ${note}.` : lang === 'fr' ? ` Note : ${note}.` : ` Their note: ${note}.`) : '';
  if (verdict === 'yes') {
    if (lang === 'ar') {
      return `${helper} يقول نعم: هذا ${label}.${notePart} قل ابحث عن غيره، أو انتهيت.`;
    }
    if (lang === 'fr') {
      return `${helper} dit oui : c’est ${label}.${notePart} Dites cherchez un autre, ou c’est fini.`;
    }
    return `${helper} says yes: this is ${label}.${notePart} Say find another, or done.`;
  }
  if (verdict === 'no') {
    if (lang === 'ar') {
      return `${helper} يقول لا: هذا ليس ${label}.${notePart} قل أرشدني، أو اقرأ مرة أخرى.`;
    }
    if (lang === 'fr') {
      return `${helper} dit non : ce n’est pas ${label}.${notePart} Dites guidez-moi, ou relisez.`;
    }
    return `${helper} says no: this is not ${label}.${notePart} Say guide me, or read again.`;
  }
  if (lang === 'ar') {
    return `${helper} لا يستطيع التحديد من الصورة.${notePart} قل اقرأ مرة أخرى، أو اسأل مرة أخرى.`;
  }
  if (lang === 'fr') {
    return `${helper} ne peut pas dire d’après la photo.${notePart} Dites relisez, ou redemandez.`;
  }
  return `${helper} can't tell from the picture.${notePart} Say read again, or ask again.`;
}
