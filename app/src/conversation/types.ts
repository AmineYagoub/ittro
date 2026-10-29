// Conversation statechart types: the context the machine carries, the
// events it answers and the input it starts from. Written fresh for
// the streaming conversation; nothing is shared with older loops.
import type { ActorRef, DoneActorEvent, ErrorActorEvent, Snapshot } from 'xstate';
import type { Language } from '../theme';
import type { Prefs } from '../store';
import type { ShelfOutline, UnderstandAnswer } from '../relay';

export type ConversationStep = 'welcome' | 'confirm' | 'offer' | 'sleep' | 'language' | 'tour' | 'translate' | 'alternative';

export interface SpokenLine {
  text: string;
  chips: string[];
}

export type SpeechPart = { clip: string } | { text: string };

export type GuidePosition = 'left' | 'middle' | 'right';

export interface GuideHand {
  x: number;
  y: number;
}

export interface SearchAnnouncement extends SpokenLine {
  kind: 'status' | 'alternative';
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
  searching: boolean;
  outlines: ShelfOutline[];
  checkedCount: number;
  searchEpoch: number;
  pendingSearch: SearchAnnouncement[];
  alternative: string | null;
  guiding: boolean;
  guideTarget: ShelfOutline | null;
  guideLabel: string;
  guideKind: string;
  guideMatches: number;
  guidePosition: GuidePosition;
  guideHand: GuideHand | null;
  guideProximity: number;
  guideCue: string | null;
  guideFresh: boolean;
  guideWrong: string | null;
  guideResume: boolean;
  guideParts: SpeechPart[];
  talkBusy: boolean;
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
  | { type: 'TALK_IDLE' }
  | { type: 'HEARD' }
  | { type: 'SEARCH_BEGIN' }
  | { type: 'SEARCH_END' }
  | { type: 'SHELF_OUTLINED'; outlines: ShelfOutline[]; kind: string }
  | { type: 'SHELF_SWEPT'; checked: number }
  | { type: 'WRONG_SHELF'; kind: string; aisle: string }
  | { type: 'CLOSE_MATCH'; wanted: string; found: string }
  | { type: 'HAND_HOLD' }
  | { type: 'SEARCH_FAILED' }
  | { type: 'SHELF_FOUND'; product: string; outline: ShelfOutline | null; matches: number; kind: string; position: GuidePosition }
  | { type: 'GUIDE_CUE'; cue: string; proximity: number; hand: GuideHand }
  | { type: 'GUIDE_ALIGNED'; proximity: number; hand: GuideHand }
  | { type: 'GUIDE_COVERING'; proximity: number; hand: GuideHand }
  | { type: 'GUIDE_NOHAND' }
  | { type: 'GUIDE_LOST' }
  | { type: 'GUIDE_GOT_IT' }
  | { type: 'GUIDE_CONTACT' }
  | { type: 'GUIDE_WRONG'; label: string; cue: string }
  | { type: 'GUIDE_TARGET_LOST'; cue: string }
  | { type: 'GUIDE_RESTART' }
  | { type: 'GUIDE_END' }
  | { type: 'NO_SHELF'; floor: boolean }
  | { type: 'OUTLINES_MOVED'; outlines: ShelfOutline[] }
  | { type: 'SHELF_TURN'; direction: 'left' | 'right' };

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

export interface SpeakPartsInput {
  parts: SpeechPart[];
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
