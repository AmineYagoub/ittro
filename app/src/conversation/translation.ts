// Carrying a request across a language switch: the switch queues the
// request for translation, and the translated answer replaces it.
import { assignConversation as assign } from './actors';
import type { ContextArgs } from './actions';
import type { Language } from '../theme';
import type { UnderstandAnswer } from '../relay';
import { BACK_CHIP } from '../chips';
import { switchedTo } from '../lines';
import type { ExpressionEvent } from './types';

export function switchedLines(target: Language, previous: Language): { text: string; chips: string[] } {
  return { text: switchedTo(target, previous), chips: [BACK_CHIP[previous]] };
}

export function spokenLang(answer: UnderstandAnswer | null, fallback: Language): Language {
  const spoken = answer?.language_spoken;
  return spoken === 'en' || spoken === 'ar' || spoken === 'fr' ? spoken : fallback;
}

export function translateKeep({ context }: ContextArgs): boolean {
  return context.translateNext === 'routing';
}

export function skipKeep({ context }: ContextArgs): boolean {
  return (context.translateSource ?? '') === '' && context.translateNext === 'routing';
}

export function skipSay({ context }: ContextArgs): boolean {
  return (context.translateSource ?? '') === '' && context.translateNext === 'saying';
}

export const switchCarry = assign({
  lang: ({ context }) => context.routeAnswer?.target_language as Language,
  translateSource: ({ context }) => context.pendingRequest ?? context.request,
  translateItems: ({ context }) => (context.pendingRequest === null ? null : context.pendingItems),
  translatePending: ({ context }) => context.pendingRequest !== null,
  translateNext: 'saying',
  pendingSay: ({ context }) => {
    const target = context.routeAnswer?.target_language as Language;
    return [switchedLines(target, context.lang)];
  },
});

function translatedOutput(event: ExpressionEvent): UnderstandAnswer | null {
  return 'output' in event ? ((event.output as UnderstandAnswer | undefined) ?? null) : null;
}

export const applyTranslated = assign({
  request: ({ context, event }) => {
    const translated = translatedOutput(event);
    if (context.translatePending || !translated || !translated.product_text) {
      return context.request;
    }
    return translated.product_text;
  },
  pendingRequest: ({ context, event }) => {
    const translated = translatedOutput(event);
    if (!context.translatePending || !translated || !translated.product_text) {
      return context.pendingRequest;
    }
    return translated.product_text;
  },
  pendingItems: ({ context, event }) => {
    const translated = translatedOutput(event);
    if (!context.translatePending || !translated) {
      return context.pendingItems;
    }
    return translated.items;
  },
  requestLang: ({ context, event }) => (translatedOutput(event) ? context.lang : context.requestLang),
  routeAnswer: ({ context, event }) => {
    const translated = translatedOutput(event);
    return context.translatePending && translated ? translated : context.routeAnswer;
  },
  translateSource: null,
  translateItems: null,
  translatePending: false,
  translateNext: 'saying',
});
