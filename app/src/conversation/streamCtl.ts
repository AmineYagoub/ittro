// Stream commands: muting, starting and stopping the voice stream
// from the states. The mic mutes while Ittro speaks and unmutes
// when listening opens again.
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

export const muteMic = toStream({ type: 'MUTE' });

export const unmuteMic = toStream({ type: 'UNMUTE' });

export const sendStop = toStream({ type: 'STOP' });

export const sendStart = toStream(({ context }) => ({ type: 'START', keywords: requestKeywords(context.request, context.brands) }));

export const ensureStream = enqueue(({ enqueue: collect, context }) => {
  if (!context.streamUp) {
    collect(sendStart);
  }
});
