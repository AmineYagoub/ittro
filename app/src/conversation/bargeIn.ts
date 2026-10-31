// Barging in: the mic stays live while Ittro speaks, so speech in
// any saying state stops Ittro and routes what was said. Transcripts
// of Ittro's own voice stay put instead, never stopping the line.
import { echoFull, echoStripped } from './echo';
import {
  logEchoDrop,
  logHeard,
  logHeardStripped,
  nonEmptyFinal,
  noteHeard,
  noteHeardStripped,
  raiseHeard,
} from './actions';
import { consumedFinal, logConsumedFinal } from './consumed';
import { notePartial, partialWorthy } from './speculating';
import { stopSpokenVoice } from './buttons';

export const bargeIn = {
  PARTIAL_TEXT: [
    { guard: echoFull, actions: [logEchoDrop] },
    { guard: partialWorthy, actions: [stopSpokenVoice, notePartial, raiseHeard], target: 'speculating' },
  ],
  FINAL_TEXT: [
    { guard: consumedFinal, actions: [logConsumedFinal] },
    { guard: echoFull, actions: [logEchoDrop] },
    { guard: echoStripped, actions: [stopSpokenVoice, noteHeardStripped, logHeardStripped, raiseHeard], target: 'understanding' },
    { guard: nonEmptyFinal, actions: [stopSpokenVoice, noteHeard, logHeard, raiseHeard], target: 'understanding' },
  ],
};
