// The guide loop's shapes: the injected clock, photo and cloud read
// it runs on, and the per-approach state it keeps between frames.
// The loop itself lives in loop.ts.
import type { ShelfBox, ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import type { ConversationEvent } from '../conversation/types';
import type { HandFix, TipPoint } from './types';

export interface GuideLoopPhoto {
  image: string;
  mime: string;
}

export interface GuideLoopDeps {
  now: () => number;
  send: (event: ConversationEvent) => void;
  log: (line: string) => void;
  cutCrop: (image: string, box: ShelfBox) => Promise<ShelfCrop | null>;
  read: (label: string, crops: ShelfCrop[]) => Promise<{ reads: ShelfRead[]; readMs: number }>;
}

export interface GuideLoop {
  setTarget: (outline: ShelfOutline, label?: string) => void;
  setPhoto: (photo: GuideLoopPhoto) => void;
  reset: () => void;
  handFrame: (fix: HandFix | null, outlines: ShelfOutline[], photoW: number, photoH: number) => Promise<void>;
}

export interface GuideLoopState {
  target: ShelfBox | null;
  label: string;
  photo: GuideLoopPhoto | null;
  lastSeenAt: number | null;
  sentLost: boolean;
  sentNoHand: boolean;
  heldCue: string | null;
  heldSince: number;
  sentAlmost: boolean;
  sentAlmostAt: number;
  coverSince: number | null;
  sentCovering: boolean;
  sentCoveringAt: number;
  sentContact: boolean;
  restAnchor: TipPoint | null;
  restSince: number;
  restRead: boolean;
  trail: Array<{ tip: TipPoint; center: TipPoint }>;
  targetGone: number;
  sentTargetLost: boolean;
}

export function freshGuideState(): GuideLoopState {
  return {
    target: null,
    label: '',
    photo: null,
    lastSeenAt: null,
    sentLost: false,
    sentNoHand: false,
    heldCue: null,
    heldSince: 0,
    sentAlmost: false,
    sentAlmostAt: 0,
    coverSince: null,
    sentCovering: false,
    sentCoveringAt: 0,
    sentContact: false,
    restAnchor: null,
    restSince: 0,
    restRead: false,
    trail: [],
    targetGone: 0,
    sentTargetLost: false,
  };
}
