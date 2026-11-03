// A heard turn that never becomes words must not leave Ittro silent.
// Each sign of the shopper's voice stops the silence clock, so in t23
// a turn Meta ended with no transcript stopped it for good: Ittro said
// nothing for four minutes. Listening waits 4 s past the newest sign
// for words, then asks again with the clock running.
import { cancelConversation as cancel, raiseConversation as raise } from './actors';
import { raiseQuestion } from './actions';
import { logIttro } from '../log';

/** How long listening waits for words after a sign of voice before the silence clock runs again. */
export const HEARD_STALE_MS = 4000;

/** Ends the wait for words: talk left listening, or a newer sign of voice restarts it. */
export const dropHeardStale = cancel('heardStale');

/** Restarts the wait for words, on every sign of the shopper's voice that brings none yet. */
export const armHeardStale = [dropHeardStale, raise({ type: 'HEARD_STALE' }, { delay: HEARD_STALE_MS, id: 'heardStale' })];

const logHeardStale = (): void => {
  logIttro('heard no words, listening again');
};

/** Listening's answer when the wait for words runs out. */
export const heardStaleOn = { HEARD_STALE: { actions: [logHeardStale, raiseQuestion] } };
