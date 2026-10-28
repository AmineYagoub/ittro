// The words under the spoken line: what the shopper can say next.
// Every chip is written in the language being spoken, except the way
// back, which names its own language.
import type { Language } from './theme';

export const YES_CHIP: Record<Language, string> = { en: 'yes', ar: 'نعم', fr: 'oui' };

export const NO_CHIP: Record<Language, string> = { en: 'no', ar: 'لا', fr: 'non' };

export const HELP_CHIP: Record<Language, string> = { en: 'help', ar: 'مساعدة', fr: 'aide' };

export const REPEAT_CHIP: Record<Language, string> = { en: 'repeat', ar: 'كرر', fr: 'répétez' };

export const STOP_CHIP: Record<Language, string> = { en: 'stop', ar: 'قف', fr: 'arrêtez' };

export const SWITCH_CHIP: Record<Language, string> = { en: 'speak Arabic', ar: 'تكلم بالإنجليزية', fr: 'parlez arabe' };

export const BACK_CHIP: Record<Language, string> = { en: 'English', ar: 'عربي', fr: 'français' };

export const ASK_CHIP: Record<Language, string> = { en: 'ask someone', ar: 'اسأل شخصًا', fr: 'demandez à quelqu’un' };
