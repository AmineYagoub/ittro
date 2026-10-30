// Request lines: every spoken line that names the shopper's product,
// in the current language.
import type { Language } from './theme';

export function shortProduct(request: string): string {
  const [head] = request.split(',');
  const short = (head ?? '').trim();
  return short.length > 0 ? short : request;
}

export function searchingFor(product: string, lang: Language): string {
  if (lang === 'ar') {
    return `نعم. أبحث عن ${product} على الرف.`;
  }
  if (lang === 'fr') {
    return `Oui. Je cherche ${product} dans le rayon.`;
  }
  return `Yes. I'm searching the shelf for ${product}.`;
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

export function declinedRequest(request: string | null, lang: Language): string {
  if (request) {
    if (lang === 'ar') {
      return `حسنًا، سأبقي ${request}.`;
    }
    if (lang === 'fr') {
      return `D’accord, je garde ${request}.`;
    }
    return `Okay, keeping ${request}.`;
  }
  if (lang === 'ar') {
    return 'حسنًا. ما الذي تبحث عنه؟';
  }
  if (lang === 'fr') {
    return 'D’accord. Que cherchez-vous ?';
  }
  return 'Okay. What are you looking for?';
}
