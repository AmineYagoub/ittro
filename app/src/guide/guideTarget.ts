// The guide target in the statechart: adopting the found product,
// re-adopting it silently after a label recheck, and the guards
// that arm the approach. A recheck never announces: the hand keeps
// moving to the same product under a corrected box.
import { assignConversation as assign } from '../conversation/actors';
import type { ContextArgs, EventArgs } from '../conversation/actions';
import { logIttro } from '../log';
import { shortProduct } from '../requestLines';

export const storeGuideTarget = assign({
  guiding: true,
  pendingSearch: [],
  alternative: null,
  step: ({ context }: ContextArgs) => (context.step === 'alternative' ? 'welcome' : context.step),
  pendingQuestion: ({ context }: ContextArgs) => (context.step === 'alternative' ? null : context.pendingQuestion),
  guideTarget: ({ event }: EventArgs) => (event.type === 'SHELF_FOUND' ? event.outline : null),
  shelfTarget: ({ event }: EventArgs) => (event.type === 'SHELF_FOUND' ? event.outline : null),
  shelfCrop: ({ context, event }: EventArgs) => (event.type === 'SHELF_FOUND' ? (event.crop ?? context.shelfCrop) : context.shelfCrop),
  guideLabel: ({ event }: EventArgs) => (event.type === 'SHELF_FOUND' ? shortProduct(event.product) : ''),
  guideKind: ({ event }: EventArgs) => (event.type === 'SHELF_FOUND' ? event.kind : ''),
  guideMatches: ({ event }: EventArgs) => (event.type === 'SHELF_FOUND' ? event.matches : 0),
  guidePosition: ({ event }: EventArgs) => (event.type === 'SHELF_FOUND' ? event.position : 'middle'),
  guideFresh: true,
  guideCue: null,
  guideHand: null,
  guideProximity: 0,
  guideWrong: null,
  guideRecheck: false,
  guideOutOfView: false,
});

export const adoptGuideTarget = assign({
  guideTarget: ({ event }: EventArgs) => (event.type === 'SHELF_FOUND' ? event.outline : null),
  shelfTarget: ({ event }: EventArgs) => (event.type === 'SHELF_FOUND' ? event.outline : null),
  shelfCrop: ({ context, event }: EventArgs) => (event.type === 'SHELF_FOUND' ? (event.crop ?? context.shelfCrop) : context.shelfCrop),
  guideRecheck: false,
  guideOutOfView: false,
});

export function logAdopted({ event }: EventArgs): void {
  if (event.type === 'SHELF_FOUND' && event.outline) {
    const box = event.outline.box;
    logIttro(`guide target re-adopted ${Math.round(box.x1)},${Math.round(box.y1)},${Math.round(box.x2)},${Math.round(box.y2)}`);
  }
}

export const hasTarget = ({ context }: ContextArgs): boolean => context.guideTarget !== null;

export const foundTarget = ({ event }: EventArgs): boolean => event.type === 'SHELF_FOUND' && event.outline !== null;

export const confirmed = ({ context }: ContextArgs): boolean => context.request !== null && context.pendingRequest === null;

export const readyToArm = ({ context }: ContextArgs): boolean =>
  hasTarget({ context }) && confirmed({ context }) && !context.guideRestarting;

export const queuesEmpty = ({ context }: ContextArgs): boolean =>
  context.pendingSearch.length === 0 && context.pendingHelper.length === 0 && context.linkLine === null;

export function readyQuiet({ context }: ContextArgs): boolean {
  return readyToArm({ context }) && !context.talkBusy && queuesEmpty({ context });
}

export function armFree({ context }: ContextArgs): boolean {
  return !context.talkBusy && queuesEmpty({ context });
}
