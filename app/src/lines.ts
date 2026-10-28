// First-launch and welcome lines. The English lines are DESIGN.md word
// for word. Arabic and French lines beyond the language choice are
// translations awaiting a native-speaker review (see the build report).
import type { Language } from './theme';

type Trilingual = Record<Language, string>;

export const micLine: Trilingual = {
  en: 'I need the microphone to hear you and the camera to see the shelf. Android will ask twice. Double-tap Allow each time.',
  ar: 'أحتاج إلى الميكروفون لأسمعك والكاميرا لأرى الرف. سيطلب منك أندرويد مرتين. انقر نقرًا مزدوجًا على سماح في كل مرة.',
  fr: "J'ai besoin du microphone pour vous entendre et de la caméra pour voir le rayon. Android va vous demander deux fois. Touchez deux fois Autoriser à chaque fois.",
};

export const refusedMic: Trilingual = {
  en: "I can't hear you without the microphone. Open Ittro's settings and allow it, then come back.",
  ar: 'لا أستطيع سماعك بدون الميكروفون. افتح إعدادات إيترو واسمح به، ثم عد.',
  fr: "Je ne peux pas vous entendre sans le microphone. Ouvrez les réglages d'Ittro et autorisez-le, puis revenez.",
};

export const refusedCamera: Trilingual = {
  en: "I can't see the shelf without the camera. Open Ittro's settings and allow it, then come back.",
  ar: 'لا أستطيع رؤية الرف بدون الكاميرا. افتح إعدادات إيترو واسمح بها، ثم عد.',
  fr: 'Je ne peux pas voir le rayon sans la caméra. Ouvrez les réglages d’Ittro et autorisez-la, puis revenez.',
};

export const chooseLanguage: Trilingual = {
  en: 'I speak English.',
  ar: 'للعربية، قل: عربي.',
  fr: 'Pour le français, dites : français.',
};

export const privacyLine: Trilingual = {
  en: "I find products and guide your hand to them. I send camera pictures to Meta to find and read products. I don't keep them.",
  ar: 'أجد المنتجات وأوجه يدك إليها. أرسل صور الكاميرا إلى ميتا للعثور على المنتجات وقراءتها. لا أحتفظ بها.',
  fr: 'Je trouve les produits et je guide votre main vers eux. J’envoie les images de la caméra à Meta pour trouver et lire les produits. Je ne les garde pas.',
};

export const tourOffer: Trilingual = {
  en: 'Do you want to hear what my sounds mean? It takes 30 seconds. Say yes or no.',
  ar: 'هل تريد أن تسمع ماذا تعني أصواتي؟ يستغرق ذلك 30 ثانية. قل نعم أو لا.',
  fr: 'Voulez-vous entendre ce que signifient mes sons ? Cela prend 30 secondes. Dites oui ou non.',
};

export const welcome: Trilingual = {
  en: "Hi, I'm Ittro. Tell me what you're looking for, or say help.",
  ar: 'مرحبًا، أنا إيترو. أخبرني عما تبحث عنه، أو قل مساعدة.',
  fr: 'Bonjour, je suis Ittro. Dites-moi ce que vous cherchez, ou dites aide.',
};

export const welcomeBack: Trilingual = {
  en: 'Welcome back.',
  ar: 'مرحبًا بعودتك.',
  fr: 'Bon retour.',
};

export const lowBattery: Trilingual = {
  en: 'Battery at 15 percent.',
  ar: 'البطارية عند 15 بالمئة.',
  fr: 'Batterie à 15 pour cent.',
};

export const phoneHot: Trilingual = {
  en: "The phone is getting hot. I'll slow down a little.",
  ar: 'الهاتف يسخن. سأبطئ قليلًا.',
  fr: 'Le téléphone chauffe. Je vais ralentir un peu.',
};

export const askChange: Trilingual = {
  en: 'Okay. What should I change?',
  ar: 'حسنًا. ما الذي يجب أن أغيّره؟',
  fr: 'D’accord. Que dois-je changer ?',
};

export const searchNext: Trilingual = {
  en: 'Yes. Searching the shelf comes next.',
  ar: 'نعم. البحث في الرف هو الخطوة التالية.',
  fr: 'Oui. La recherche dans le rayon vient ensuite.',
};

export const notBuilt: Trilingual = {
  en: "I can't do that yet.",
  ar: 'لا أستطيع فعل ذلك بعد.',
  fr: 'Je ne peux pas encore faire ça.',
};

export const didntCatch: Trilingual = {
  en: "I didn't catch that. Say it again.",
  ar: 'لم أفهم ذلك. قله مرة أخرى.',
  fr: 'Je n’ai pas compris. Redites-le.',
};

export const didntCatchHelp: Trilingual = {
  en: "I didn't catch that. Say it again, or say help.",
  ar: 'لم أفهم ذلك. قله مرة أخرى، أو قل مساعدة.',
  fr: 'Je n’ai pas compris. Redites-le, ou dites aide.',
};

export const askAgain: Trilingual = {
  en: "I'm listening. Say yes or no.",
  ar: 'أنا أستمع. قل نعم أو لا.',
  fr: 'Je vous écoute. Dites oui ou non.',
};

export const offerHelp: Trilingual = {
  en: 'Say help to hear what you can say.',
  ar: 'قل مساعدة لتسمع ما يمكنك قوله.',
  fr: 'Dites aide pour entendre ce que vous pouvez dire.',
};

export const helpWelcome: Trilingual = {
  en: 'You can say: what you are looking for, repeat, speak Arabic, or stop. What are you looking for?',
  ar: 'يمكنك أن تقول: ما تبحث عنه، أو كرر، أو تكلم بالإنجليزية، أو قف. ما الذي تبحث عنه؟',
  fr: 'Vous pouvez dire : ce que vous cherchez, répétez, parlez arabe, ou arrêtez. Que cherchez-vous ?',
};

export const helpConfirm: Trilingual = {
  en: 'You can say: yes, no, repeat, or stop. Is that right? Say yes or no.',
  ar: 'يمكنك أن تقول: نعم، أو لا، أو كرر، أو قف. هل هذا صحيح؟ قل نعم أو لا.',
  fr: 'Vous pouvez dire : oui, non, répétez, ou arrêtez. C’est bien ça ? Dites oui ou non.',
};

export const stopped: Trilingual = {
  en: 'Stopped. Say Ittro when you need me.',
  ar: 'توقفت. قل إيترو عندما تحتاجني.',
  fr: 'Arrêté. Dites Ittro quand vous avez besoin de moi.',
};

export const doneLine: Trilingual = {
  en: 'Okay. Say Ittro when you need me.',
  ar: 'حسنًا. قل إيترو عندما تحتاجني.',
  fr: 'D’accord. Dites Ittro quand vous avez besoin de moi.',
};

export const pausing: Trilingual = {
  en: "I'm pausing. Open Ittro to wake me.",
  ar: 'سأتوقف مؤقتًا. افتح إيترو لإيقاظي.',
  fr: 'Je me mets en pause. Ouvrez Ittro pour me réveiller.',
};

export const lostInternet: Trilingual = {
  en: "I've lost the internet. I'll keep trying.",
  ar: 'فقدت الاتصال بالإنترنت. سأستمر في المحاولة.',
  fr: 'J’ai perdu internet. Je réessaie.',
};

export const whatToFind: Trilingual = {
  en: 'What are you looking for?',
  ar: 'ما الذي تبحث عنه؟',
  fr: 'Que cherchez-vous ?',
};

export const helpSearching: Trilingual = {
  en: 'You can say: find another, repeat, speak Arabic, or stop.',
  ar: 'يمكنك أن تقول: ابحث عن غيره، أو كرر، أو تكلم بالإنجليزية، أو قف.',
  fr: 'Vous pouvez dire : cherchez un autre, répétez, parlez arabe, ou arrêtez.',
};

export const shorterAck: Trilingual = {
  en: 'Okay, shorter.',
  ar: 'حسنًا، باختصار.',
  fr: 'D’accord, plus court.',
};

export const moreAck: Trilingual = {
  en: 'Okay, more detail.',
  ar: 'حسنًا، بتفصيل أكثر.',
  fr: 'D’accord, plus de détails.',
};

export const fasterAck: Trilingual = {
  en: 'Okay, faster.',
  ar: 'حسنًا، أسرع.',
  fr: 'D’accord, plus vite.',
};

export const slowerAck: Trilingual = {
  en: 'Okay, slower.',
  ar: 'حسنًا، أبطأ.',
  fr: 'D’accord, plus lentement.',
};

export const keepSpeaking: Trilingual = {
  en: "Okay, I'll keep speaking English.",
  ar: 'حسنًا، سأستمر في التحدث بالعربية.',
  fr: 'D’accord, je continue en français.',
};

const backName: Record<Language, Record<Language, string>> = {
  en: { en: 'English', ar: 'Arabic', fr: 'French' },
  ar: { en: 'الإنجليزية', ar: 'العربية', fr: 'الفرنسية' },
  fr: { en: 'l’anglais', ar: 'l’arabe', fr: 'le français' },
};

export function switchedTo(target: Language, previous: Language): string {
  if (target === 'ar') {
    return `حسناً، سأتكلم بالعربية الآن. قل ${previous === 'fr' ? 'French' : 'English'} للعودة إلى ${backName.ar[previous]}.`;
  }
  if (target === 'fr') {
    return `D’accord, je parle français maintenant. Dites ${previous === 'ar' ? 'عربي' : 'English'} pour revenir au ${backName.fr[previous]}.`;
  }
  return `Okay, I'll speak English now. Say speak ${backName.en[previous]} to switch back.`;
}

export function offerLanguage(target: Language): string {
  if (target === 'ar') {
    return 'هل تريد أن أتكلم بالعربية؟ قل نعم أو لا.';
  }
  if (target === 'fr') {
    return 'Voulez-vous que je parle français ? Dites oui ou non.';
  }
  return 'Do you want me to speak English? Say yes or no.';
}

export function confirmRequest(product: string, lang: Language): string {
  if (lang === 'ar') {
    return `طلبت ${product}. هل هذا صحيح؟ قل نعم أو لا.`;
  }
  if (lang === 'fr') {
    return `Vous avez demandé ${product}. C’est bien ça ? Dites oui ou non.`;
  }
  return `You asked for ${product}. Is that right? Say yes or no.`;
}

const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five'];

export function confirmList(items: string[], lang: Language): string {
  if (lang === 'ar') {
    return `طلبت ${items.length} أشياء: ${items.join('، ثم ')}. هل هذا صحيح؟ قل نعم أو لا.`;
  }
  if (lang === 'fr') {
    return `Vous avez demandé ${items.length} choses : ${items.join(', puis ')}. C’est bien ça ? Dites oui ou non.`;
  }
  const count = COUNT_WORDS[items.length - 1] ?? String(items.length);
  return `You asked for ${count} things: ${items.join(', then ')}. Is that right? Say yes or no.`;
}

export function stillLooking(product: string, lang: Language): string {
  if (lang === 'ar') {
    return `ما زلت أبحث عن ${product}. قل ابحث عن غيره لتغييره.`;
  }
  if (lang === 'fr') {
    return `Je cherche toujours ${product}. Dites chercher un autre pour changer.`;
  }
  return `Still looking for ${product}. Say find another to change it.`;
}

export function welcomeBackLooking(product: string, lang: Language): string {
  if (lang === 'ar') {
    return `مرحبًا بعودتك. ما زلت تبحث عن ${product}.`;
  }
  if (lang === 'fr') {
    return `Bon retour. Vous cherchez toujours ${product}.`;
  }
  return `Welcome back. Still looking for ${product}.`;
}

export const tourMeaning: Trilingual[] = [
  {
    en: 'This short note means I heard you.',
    ar: 'هذه النغمة القصيرة تعني أنني سمعتك.',
    fr: 'Cette note courte signifie que je vous ai entendu.',
  },
  {
    en: 'These two rising notes mean I am listening.',
    ar: 'هاتان النغمتان الصاعدتان تعنيان أنني أستمع.',
    fr: 'Ces deux notes montantes signifient que j’écoute.',
  },
  {
    en: 'This tick means I am working.',
    ar: 'هذه التكة تعني أنني أعمل.',
    fr: 'Ce tic signifie que je travaille.',
  },
  {
    en: 'This falling note means I lost track. Keep still.',
    ar: 'هذه النغمة الهابطة تعني أنني فقدت التتبع. ابق ثابتًا.',
    fr: 'Cette note descendante signifie que j’ai perdu la trace. Restez immobile.',
  },
  {
    en: 'This chime up means yes.',
    ar: 'هذا الرنين الصاعد يعني نعم.',
    fr: 'Ce carillon montant signifie oui.',
  },
  {
    en: 'This chime down means no.',
    ar: 'هذا الرنين الهابط يعني لا.',
    fr: 'Ce carillon descendant signifie non.',
  },
];
