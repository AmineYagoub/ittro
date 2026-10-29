// The link side of the conversation: the relay connection is a
// state, so each failure is said once and Ittro recovers on its own.
// Down is lost internet, limited is the relay asking to slow down
// or the day's budget spent, broken is an unusable answer. Any
// success sends LINK_OK and the next failure speaks again.
import { assignConversation as assign, raiseConversation as raise } from './actors';
import type { ContextArgs, EventArgs } from './actions';
import { linkKindFor } from '../metaCall';
import type { LinkKind } from '../metaCall';
import { linkBroken, linkDown, linkLimited } from '../lines';
import type { ConversationEvent } from './types';

export const raiseLinkOk = raise({ type: 'LINK_OK' });

export const raiseLinkDown = raise({ type: 'LINK_DOWN' });

export function linkEvent(kind: LinkKind): ConversationEvent {
  if (kind === 'down') {
    return { type: 'LINK_DOWN' };
  }
  return kind === 'limited' ? { type: 'LINK_LIMITED' } : { type: 'LINK_BROKEN' };
}

export const raiseLinkKind = raise(({ event }: EventArgs): ConversationEvent => {
  if (event.type === 'SEARCH_FAILED' || event.type === 'CONFIRM_FAILED') {
    return linkEvent(event.kind);
  }
  return { type: 'LINK_BROKEN' };
});

export const raiseLinkForError = raise(({ event }: EventArgs): ConversationEvent => {
  if ('error' in event) {
    return linkEvent(linkKindFor(event.error));
  }
  return { type: 'LINK_BROKEN' };
});

function linkText(kind: LinkKind, lang: 'en' | 'ar' | 'fr'): string {
  if (kind === 'down') {
    return linkDown[lang];
  }
  return kind === 'limited' ? linkLimited[lang] : linkBroken[lang];
}

function queueLink(kind: LinkKind) {
  return assign({
    linkLine: ({ context }: ContextArgs) => ({ text: linkText(kind, context.lang), chips: [] as string[] }),
  });
}

const clearLink = assign({ linkLine: null });

export const hasLinkLine = ({ context }: ContextArgs): boolean => context.linkLine !== null;

export const sayLinkLine = assign({
  pendingSay: ({ context }: ContextArgs) => (context.linkLine ? [context.linkLine] : []),
  linkLine: null,
});

export const linkRegion = {
  initial: 'ok',
  states: {
    ok: {
      on: {
        LINK_OK: { actions: [clearLink] },
        LINK_DOWN: { actions: [queueLink('down')], target: 'down' },
        LINK_LIMITED: { actions: [queueLink('limited')], target: 'limited' },
        LINK_BROKEN: { actions: [queueLink('broken')], target: 'broken' },
      },
    },
    down: {
      on: {
        LINK_OK: { actions: [clearLink], target: 'ok' },
        LINK_LIMITED: { actions: [queueLink('limited')], target: 'limited' },
        LINK_BROKEN: { actions: [queueLink('broken')], target: 'broken' },
        LINK_DOWN: { actions: [] },
      },
    },
    limited: {
      on: {
        LINK_OK: { actions: [clearLink], target: 'ok' },
        LINK_DOWN: { actions: [queueLink('down')], target: 'down' },
        LINK_BROKEN: { actions: [queueLink('broken')], target: 'broken' },
        LINK_LIMITED: { actions: [] },
      },
    },
    broken: {
      on: {
        LINK_OK: { actions: [clearLink], target: 'ok' },
        LINK_DOWN: { actions: [queueLink('down')], target: 'down' },
        LINK_LIMITED: { actions: [queueLink('limited')], target: 'limited' },
        LINK_BROKEN: { actions: [] },
      },
    },
  },
};
