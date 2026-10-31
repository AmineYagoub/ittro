// An early-routed sentence is consumed: when its own final lands a
// moment later, it is the same words already acted on, not a second
// answer. Two seconds covers the gap between a routed partial and
// the endpointed final; a later identical final is new speech.
import type { EventArgs } from './actions';
import { logIttro } from '../log';
export const CONSUMED_FINAL_MS = 2000;

export const consumedFinal = ({ context, event }: EventArgs): boolean =>
  event.type === 'FINAL_TEXT' &&
  context.consumedText !== null &&
  event.text === context.consumedText &&
  Date.now() - context.consumedAt <= CONSUMED_FINAL_MS;

export const logConsumedFinal = ({ event }: EventArgs): void => {
  if (event.type === 'FINAL_TEXT') {
    logIttro(`dropped already routed final: ${JSON.stringify(event.text)}`);
  }
};
