// Conversation statechart types: the context the machine carries, the
// events it answers and the input it starts from. Written fresh for
// the streaming conversation; nothing is shared with older loops.
import type { ActorRef, DoneActorEvent, ErrorActorEvent, Snapshot } from 'xstate';
import type { Language } from '../theme';
import type { Prefs } from '../store';
import type { LinkKind } from '../metaCall';
import type { ConfirmAttr, DetailKind, DetailReason, PictureProblem, ShelfBox, ShelfOutline, UnderstandAnswer } from '../relay';

export type ConversationStep = 'welcome' | 'confirm' | 'offer' | 'sleep' | 'language' | 'tour' | 'translate' | 'alternative' | 'verdict' | 'helperName' | 'helperSend' | 'helperOffer';

export type { ConfirmAttr, DetailKind, DetailReason, PictureProblem };

export interface SpokenLine {
  text: string;
  chips: string[];
}

export interface VoiceEcho {
  text: string;
  at: number;
}

export type SpeechPart = { clip: string } | { text: string };

export type GuidePosition = 'left' | 'middle' | 'right';

export type ButtonGesture = 'single' | 'double' | 'triple' | 'hold' | 'volumeHold';

export interface GuideHand {
  x: number;
  y: number;
}

export interface SearchAnnouncement extends SpokenLine {
  kind: 'status' | 'alternative';
}

export interface HelperContact {
  name: string;
  token: string;
}

export interface HelperPairing {
  name: string;
  code: string;
  expiresAt: number;
}

export interface HelperWaiting {
  id: string;
  helpers: string[];
  label: string;
}

export interface HelperAnswer {
  verdict: 'yes' | 'no' | 'cant_tell';
  note: string | null;
  helper: string;
}

export interface HelperQueued extends SpokenLine {
  kind: 'status' | 'answer';
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

export type StreamCommand = { type: 'START'; keywords: string[] } | { type: 'STOP' };

export type StreamEmitted =
  | { type: 'STREAM_OPEN' }
  | { type: 'STREAM_CLOSED' }
  | { type: 'STREAM_ERROR'; message: string }
  | { type: 'STREAM_FAILED'; message: string }
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
  lastPartialAt: number | null;
  consumedText: string | null;
  consumedAt: number;
  request: string | null;
  requestLang: Language | null;
  translateSource: string | null;
  translateItems: string[] | null;
  translatePending: boolean;
  translateNext: 'saying' | 'routing';
  rate: number;
  firstLaunchDone: boolean;
  lastLine: string;
  lastChips: string[];
  voiceAt: number;
  voiceLog: VoiceEcho[];
  pendingSay: SpokenLine[];
  routeAnswer: UnderstandAnswer | null;
  transcript: string;
  pausedNote: SpokenLine[];
  pausedReturn: 'listening' | 'sleeping';
  brands: string[];
  micSaidAt: number;
  linkLine: SpokenLine | null;
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
  shelfTarget: ShelfOutline | null;
  guideLabel: string;
  guideKind: string;
  guideMatches: number;
  guidePosition: GuidePosition;
  guideHand: GuideHand | null;
  guideProximity: number;
  guideCue: string | null;
  guideFresh: boolean;
  guideWrong: string | null;
  guideRecheck: boolean;
  guideRestarting: boolean;
  guideOutOfView: boolean;
  guideParts: SpeechPart[];
  guideReaching: boolean;
  earbuds: boolean;
  earbudHintDone: boolean;
  holdSeen: boolean;
  buttonPresses: number;
  holdHintDone: boolean;
  talkBusy: boolean;
  confirming: boolean;
  confirmEpoch: number;
  confirmAsked: boolean;
  confirmVerdict: 'yes' | 'no' | 'unsure' | 'picture' | null;
  confirmFinal: boolean;
  confirmLabel: string;
  confirmRead: string[];
  confirmMissing: ConfirmAttr[];
  confirmProblem: PictureProblem | null;
  confirmCrop: string | null;
  confirmBox: ShelfBox | null;
  confirmParts: SpeechPart[];
  confirmDetailKind: DetailKind | null;
  confirmDetailText: string | null;
  confirmDetailReason: DetailReason | null;
  helpers: HelperContact[];
  pairing: HelperPairing | null;
  waiting: HelperWaiting | null;
  nudgeCount: number;
  helperAnswer: HelperAnswer | null;
  pendingHelper: HelperQueued[];
  unsureStreak: number;
  helperOfferDone: boolean;
  helperVerdict: 'yes' | 'no' | 'unsure' | null;
  helperLabel: string;
  askTarget: string[] | null;
  askQuestion: string;
  sentPhoto: string | null;
}

export type ConversationEvent =
  | { type: 'FINAL_TEXT'; text: string }
  | { type: 'PARTIAL_TEXT'; text: string }
  | { type: 'SPEECH_ENDED' }
  | { type: 'STREAM_OPEN' }
  | { type: 'STREAM_CLOSED' }
  | { type: 'STREAM_ERROR'; message: string }
  | { type: 'STREAM_FAILED'; message: string }
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
  | { type: 'SEARCH_FAILED'; kind: LinkKind }
  | { type: 'LINK_DOWN' }
  | { type: 'LINK_LIMITED' }
  | { type: 'LINK_BROKEN' }
  | { type: 'LINK_OK' }
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
  | { type: 'SHELF_TURN'; direction: 'left' | 'right' }
  | { type: 'CONFIRM_BEGIN' }
  | { type: 'CONFIRM_AUTO' }
  | { type: 'CONFIRM_YES'; epoch: number; label: string; crop: string }
  | { type: 'CONFIRM_NO'; epoch: number; label: string; crop: string }
  | { type: 'CONFIRM_UNSURE'; epoch: number; label: string; crop: string; read: string[]; missing: ConfirmAttr[] }
  | { type: 'CONFIRM_PICTURE'; epoch: number; problem: PictureProblem }
  | { type: 'CONFIRM_MOVED'; epoch: number }
  | { type: 'CONFIRM_GIVEUP' }
  | { type: 'CONFIRM_FAILED'; kind: LinkKind }
  | { type: 'CONFIRM_DETAIL_ASK' }
  | { type: 'CONFIRM_DETAIL'; epoch: number; text: string | null; reason: DetailReason | null; crop: string }
  | { type: 'CONFIRM_END' }
  | { type: 'BUTTON_PRESS'; gesture: ButtonGesture }
  | { type: 'EARBUD_STATE'; connected: boolean }
  | { type: 'HELPER_CODE' }
  | { type: 'HELPER_JOINED'; name: string; token: string }
  | { type: 'HELPER_PAIR_EXPIRED' }
  | { type: 'HELPER_SENT' }
  | { type: 'HELPER_ANSWER'; verdict: 'yes' | 'no' | 'cant_tell'; note: string | null; helper: string }
  | { type: 'HELPER_NUDGE' }
  | { type: 'HELPER_TIMEOUT'; names: string[] }
  | { type: 'HELPER_END' };

export type ExpressionEvent = ConversationEvent | DoneActorEvent | ErrorActorEvent;

export interface StreamInput {
  url: string;
  code: string;
  keywords: string[];
  retryBaseMs?: number;
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
