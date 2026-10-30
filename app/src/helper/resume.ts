// After a helper no, Ittro guides on its own: with a shelf
// target it guides straight back to it, without one it searches
// the shelf again, and when already guiding it just clears the
// answer. The answered state runs these on its next free moment.
import { assignConversation as assign } from '../conversation/actors';
import type { ContextArgs } from '../conversation/actions';
import { raiseSearchBegin, resumeGuideShelf } from '../conversation/search';
import { raiseGuideRestart } from '../guide/guideSay';
import { noteVerdictDone } from '../confirm/verdicts';
import { logIttro } from '../log';

export const helperNoSaid = ({ context }: ContextArgs): boolean =>
  context.helperVerdict === 'no' && context.pendingHelper.length === 0;

export const helperNoGuide = ({ context }: ContextArgs): boolean =>
  helperNoSaid({ context }) && context.shelfTarget !== null && !context.guiding && !context.confirming;

export const helperNoSearch = ({ context }: ContextArgs): boolean =>
  helperNoSaid({ context }) && context.shelfTarget === null && !context.guiding && !context.confirming;

export const helperNoClear = ({ context }: ContextArgs): boolean => helperNoSaid({ context }) && context.guiding;

export const clearHelperNo = assign({ helperAnswer: null, helperVerdict: null });

export const logHelperNoGuide = ({ context }: ContextArgs): void => {
  logIttro(`guide auto after helper no epoch ${context.searchEpoch}`);
};

export const logHelperNoSearch = ({ context }: ContextArgs): void => {
  logIttro(`search auto after helper no epoch ${context.searchEpoch}`);
};

export const resumeGuideNo = [logHelperNoGuide, clearHelperNo, noteVerdictDone, resumeGuideShelf, raiseGuideRestart, raiseSearchBegin];

export const resumeSearchNo = [logHelperNoSearch, clearHelperNo, noteVerdictDone, raiseSearchBegin];

export const dropHelperNo = [clearHelperNo, noteVerdictDone];
