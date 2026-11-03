// The ask slice's types: questions about what the camera sees, the
// exchanges kept for follow-ups, and the hints an understanding call
// carries when it may answer a question in the same call.
export interface ViewReply {
  answer: string;
  offer: string | null;
  unreadable: string[];
}

export interface ViewTurn {
  shopper: string;
  ittro: string;
  /** Whether the whole answer was spoken; a barge-in keeps its first sentence only. */
  heard: boolean;
}

export interface AskExchange {
  shopper: string;
  ittro: string;
}

export interface AskHints {
  history: AskExchange[];
  inventory: string[];
  upset: boolean;
  brief: boolean;
}

export interface UnderstandAsk extends AskHints {
  /** The sentence sounds like a question: send the fresh still, if any. */
  withStill: boolean;
}

export type AskEvent = { type: 'VIEW_CAMERA_IDLE' };

export interface AskContext {
  viewHistory: ViewTurn[];
  viewQuestion: string | null;
  viewWanted: string | null;
  viewReply: ViewReply | null;
  viewBrief: boolean;
  viewCamera: boolean;
  viewAckAt: number;
}
