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

export const buttonsLine: Trilingual = {
  en: 'You can also hold the volume-down key to stop me.',
  ar: 'يمكنك أيضًا الضغط مطولًا على زر خفض الصوت لإيقافي.',
  fr: 'Vous pouvez aussi maintenir la touche de volume bas pour m’arrêter.',
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
