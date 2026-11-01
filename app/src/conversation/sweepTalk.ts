// The sweep's lines reach the shopper through the search queue: a new
// cue replaces any sweep cue not yet said, so a late "turn right" never
// follows a "stop". The not-here summary says the shelf was checked
// (the whole shelf only after a full sweep), what is there instead, and
// offers the closest product when Muse Spark named one, where yes
// searches for it; with no offer it says what the shopper can say next.
import { assignConversation as assign } from './actors';
import type { EventArgs } from './actions';
import { notHereNextLine, notHereOfferLine, sweepLine, wholeShelfLine } from '../shelf/sweepLines';
import { shortProduct } from '../requestLines';
import { ASK_CHIP, FIND_ANOTHER_CHIP, KEEP_LOOKING_CHIP, NO_CHIP, YES_CHIP } from '../chips';
import type { SearchAnnouncement } from './types';

function withoutSweep(queue: SearchAnnouncement[]): SearchAnnouncement[] {
  return queue.filter((line) => line.kind !== 'sweep');
}

const storeSweepCue = assign({
  pendingSearch: ({ context, event }: EventArgs) =>
    event.type === 'SWEEP_CUE'
      ? [...withoutSweep(context.pendingSearch), { text: sweepLine(event.cue, shortProduct(event.product), context.lang), chips: [], kind: 'sweep' as const }].slice(-3)
      : context.pendingSearch,
});

const storeNotHere = assign({
  alternative: ({ context, event }: EventArgs) => (event.type === 'NOT_HERE' ? event.offer : context.alternative),
  pendingSearch: ({ context, event }: EventArgs) => {
    if (event.type !== 'NOT_HERE') {
      return context.pendingSearch;
    }
    const lang = context.lang;
    const text = [event.whole ? wholeShelfLine(lang) : '', event.answer, event.offer ? notHereOfferLine(event.offer, lang) : notHereNextLine(lang)]
      .filter((part) => part.length > 0)
      .join(' ');
    const line: SearchAnnouncement = event.offer
      ? { text, chips: [YES_CHIP[lang], NO_CHIP[lang]], kind: 'alternative' }
      : { text, chips: [KEEP_LOOKING_CHIP[lang], FIND_ANOTHER_CHIP[lang], ASK_CHIP[lang]], kind: 'status' };
    return [...withoutSweep(context.pendingSearch), line].slice(-3);
  },
});

export const sweepTalkOn = {
  SWEEP_CUE: { actions: [storeSweepCue] },
  NOT_HERE: { actions: [storeNotHere] },
};
