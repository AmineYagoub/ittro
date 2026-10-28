// Conversation statechart types: the context the machine carries, the
// events it answers and the input it starts from. Written fresh for
// the streaming conversation; nothing is shared with older loops.
import type { ActorRef, DoneActorEvent, ErrorActorEvent, Snapshot } from 'xstate';
import type { Language } from '../theme';
import type { Prefs } from '../store';
import type { UnderstandAnswer } from '../relay';

export type ConversationStep = 'welcome' | 'confirm' | 'offer' | 'sleep' | 'language' | 'tour' | 'translate';

export interface SpokenLine {
  text: string;
  chips: string[];
}

export interface MachineSnapshot {
  request: string | null;
}

export interface MachineInput {
  prefs: Prefs;
  snapshot: MachineSnapshot;
  relayUrl: string;
  relayCode: string;
}

export type StreamCommand =
  | { type: 'MUTE' }
  | { type: 'UNMUTE' }
  | { type: 'START'; keywords: string[] }
  | { type: 'STOP' };

export type StreamEmitted =
  | { type: 'STREAM_OPEN' }
  | { type: 'STREAM_CLOSED' }
  | { type: 'STREAM_ERROR'; message: string }
  | { type: 'SPEECH_ENDED' }
  | { type: 'FINAL_TEXT'; text: string }
  | { type: 'PARTIAL_TEXT'; text: string }
  | { type: 'MIC_FAILED' };

export type StreamRef = ActorRef<Snapshot<undefined>, StreamCommand | StreamEmitted> | null;

export interface ConversationContext {
  lang: Language;
  epoch: number;
  askedEpoch: number;
  step: ConversationStep;
  pendingQuestion: string | null;
  pendingRequest: string | null;
  pendingItems: string[] | null;
  offerReturn: 'welcome' | 'confirm';
  offerTarget: Language | null;
  deferred: UnderstandAnswer | null;
  offered: boolean;
  misses: number;
  specText: string | null;
  specAnswer: UnderstandAnswer | null;
  specEpoch: number;
  request: string | null;
  requestLang: Language | null;
  translateSource: string | null;
  translateItems: string[] | null;
  translatePending: boolean;
  rate: number;
  firstLaunchDone: boolean;
  lastLine: string;
  lastChips: string[];
  pendingSay: SpokenLine[];
  routeAnswer: UnderstandAnswer | null;
  transcript: string;
  pausedNote: SpokenLine[];
  pausedReturn: 'listening' | 'sleeping';
  netSaidAt: number;
  micSaidAt: number;
  warnedBattery: boolean;
  warnedHeat: boolean;
  streamUp: boolean;
  streamRef: StreamRef;
  relayUrl: string;
  relayCode: string;
  cameraOn: boolean;
}

export type ConversationEvent =
  | { type: 'FINAL_TEXT'; text: string }
  | { type: 'PARTIAL_TEXT'; text: string }
  | { type: 'SPEECH_ENDED' }
  | { type: 'STREAM_OPEN' }
  | { type: 'STREAM_CLOSED' }
  | { type: 'STREAM_ERROR'; message: string }
  | { type: 'MIC_FAILED' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ALERT'; kind: 'battery' | 'heat'; text: string }
  | { type: 'REPROMPT' }
  | { type: 'HELP' }
  | { type: 'QUESTION_ASKED' }
  | { type: 'HEARD' };

export type ExpressionEvent = ConversationEvent | DoneActorEvent | ErrorActorEvent;

export interface StreamInput {
  url: string;
  code: string;
  keywords: string[];
}

export interface SpeakInput {
  lines: SpokenLine[];
  lang: Language;
}

export interface UnderstandInput {
  transcript: string;
  lang: Language;
  step: ConversationStep;
  pendingQuestion: string | null;
  pendingRequest: string | null;
  lastLine: string;
}

export interface TourInput {
  lang: Language;
}
