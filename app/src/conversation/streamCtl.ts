// Stream commands: starting and stopping the voice stream from
// the states. The mic stays live while Ittro speaks, so the
// shopper can always interrupt; transcripts of Ittro's own voice
// are dropped by the echo check instead.
import { enqueueConversation as enqueue, requestKeywords, sendToConversation as sendTo } from './actors';
import type { ContextArgs } from './actions';
import type { ConversationContext, StreamCommand } from './types';

export function wsUrl(relayUrl: string): string {
  return relayUrl.replace(/^http/, 'ws');
}

export function toStream(command: StreamCommand | ((args: ContextArgs) => StreamCommand)) {
  return sendTo(
    ({ context }: ContextArgs) => context.streamRef as NonNullable<ConversationContext['streamRef']>,
    command,
  );
}

export const sendStop = toStream({ type: 'STOP' });

export const sendStart = toStream(({ context }) => ({ type: 'START', keywords: requestKeywords(context.request, context.brands) }));

export const ensureStream = enqueue(({ enqueue: collect, context }) => {
  if (!context.streamUp) {
    collect(sendStart);
  }
});
