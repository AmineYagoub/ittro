// The shelf loop's shapes: the injected clock, frames and cloud it
// runs on, the photos it keeps, and the statistics it reports. The
// loop itself lives in loop.ts; the cloud half in loopReads.ts. Each
// photo keeps where the camera pointed, so the guided outline is cut
// again once the phone rests after a move (recut.ts, t31), and whether
// a hand was in view.
import type { Language } from '../theme';
import type { FoundShelf, SceneView, ShelfBox, ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import type { GreyFrame } from './tracker';
import type { Tracked } from './shelfTracks';
import type { ConversationEvent } from '../conversation/types';
import type { ViewReply } from '../conversation/askTypes';
import type { SweepState } from './sweep';
import type { HandBox } from '../guide/types';

export interface LoopPhoto {
  image: string;
  mime: string;
  w: number;
  h: number;
  grey: GreyFrame;
  shot?: number;
  /** When the still was taken, so a sweep stop reads only stills from after the camera settled. */
  at?: number;
  /** Where the camera pointed as the still was taken, so a move since is known. */
  pan?: CameraPan;
  /** A hand was in view as the still was taken: near the product, SAM cuts it in with it. */
  hand?: boolean;
  /** Where that hand was, photo pixels: outlines it touches are dropped from the cut. */
  handBox?: HandBox | null;
}

export interface LoopContext {
  lang: Language;
  alternative: string | null;
  checkedCount: number;
  guiding?: boolean;
  handCovering?: boolean;
  guideLost?: boolean;
  guideRecheck?: boolean;
  guideBox?: ShelfBox | null;
  /** A sweep cue still waits in the conversation's queue: the sweep's clocks hold. */
  sweepPending?: boolean;
}

export interface LoopCut {
  track: string;
  outline: ShelfOutline;
}

export interface LoopDeps {
  now: () => number;
  /** Keeps the phrase that outlined, for the next search of this product. */
  keepPhrase?: (request: string, phrase: string) => void;
  outline: (image: string, mime: string, phrase: string, w: number, h: number) => Promise<{ outlines: ShelfOutline[]; samMs: number; maskMs: number }>;
  fetchPhrase: (request: string, image: string, mime: string) => Promise<string>;
  /** The grounding find (relay /find); absent, every pass takes the phrase path. */
  find?: (request: string, image: string, mime: string, w: number, h: number) => Promise<FoundShelf>;
  read: (request: string, crops: ShelfCrop[]) => Promise<{ reads: ShelfRead[]; readMs: number }>;
  classify: (request: string, image: string, mime: string, language: Language) => Promise<SceneView>;
  cutCrops: (image: string, tracks: LoopCut[]) => Promise<ShelfCrop[]>;
  readContext: () => LoopContext;
  /** Where the camera points now, for the inventory, the sweep and the re-cut; absent in tests. */
  pan?: () => CameraPan | null;
  /** A hand is in view now: near the product, SAM would cut it in with it; absent in tests. */
  handInView?: () => boolean;
  /** Where the hand in view is, photo pixels, when the tracker gives its box. */
  handBox?: () => HandBox | null;
  /** Where the camera pointed as still `shot` was taken, in pan()'s terms; absent in tests. */
  stillPan?: (shot: number) => CameraPan | null;
  /** The not-here summary at the end of a sweep (relay /ask-view). */
  notHere?: (wanted: string, image: string, mime: string, seen: string[]) => Promise<ViewReply>;
  send: (event: ConversationEvent) => void;
  log: (line: string) => void;
}

export interface LoopStats {
  samCalls: number;
  readCalls: number;
  readCrops: number;
  classifyCalls: number;
  findCalls: number;
}

export interface LoopState {
  request: string;
  epoch: number;
  tracks: Tracked[];
  counter: number;
  phrases: Map<string, string>;
  /** The phrase asked from a blurry frame while a sharp one is awaited. */
  phraseWait: Promise<string> | null;
  cloudBusy: boolean;
  outlinedAt: number | null;
  /** Where the camera pointed for the still the outlines were last cut from. */
  outlinedPan: CameraPan | null;
  /** When a re-cut was last asked: only stills taken since are cut. */
  recutAt: number | null;
  /** A re-cut was asked and no pass has cut since: that pass may read to place the target again. */
  recutPending: boolean;
  readAt: number | null;
  sceneChanged: boolean;
  lastSignature: string;
  lastScene: string;
  failAt: number | null;
  classifyAt: number | null;
  emptyPasses: number;
  emptyOutlines: number;
  fruitlessPasses: number;
  blurrySkips: number;
  sweptEpoch: number;
  foundKey: string;
  foundTrack: string | null;
  foundOutline: ShelfOutline | null;
  /** Each track's last label crop, for the verdict card's photo. */
  crops: Map<string, string>;
  /** Tracks and crops carried from the last request, read before a photo. */
  carried: { phrase: string | null } | null;
  turnRightNext: boolean;
  sweep: SweepState;
  /** The sharpest still of the last pass, for the not-here summary. */
  lastStill: LoopPhoto | null;
  stats: LoopStats;
}

export interface ShelfLoop {
  setTarget: (request: string, epoch: number) => void;
  reset: () => void;
  fail: (error: unknown) => void;
  busy: () => boolean;
  cloudDue: () => boolean;
  trackShift: (dx: number, dy: number, changed: boolean, scale: number) => void;
  cloudPass: (photos: LoopPhoto[], hand?: ShelfCrop | null) => Promise<void>;
  carry: (pan: CameraPan | null) => ShelfCarry | null;
  seed: (carry: ShelfCarry, pan: CameraPan | null) => boolean;
  carriedPass: () => Promise<boolean>;
  sweepTick: () => void;
  stats: () => LoopStats;
}

export interface CameraPan {
  x: number;
  y: number;
  /** How much the picture has grown since the camera opened, 1 at first. */
  s?: number;
  /** Each camera opening counts its motion from zero. */
  session?: number;
}

/** The last request's tracks and label crops, with where the camera was. */
export interface ShelfCarry {
  request: string;
  tracks: Tracked[];
  crops: Array<[string, string]>;
  phrase: string | null;
  at: number;
  pan: CameraPan;
}
