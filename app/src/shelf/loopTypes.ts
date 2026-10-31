// The shelf loop's shapes: the injected clock, frames and cloud it
// runs on, the photos it keeps, and the statistics it reports. The
// loop itself lives in loop.ts; the cloud half in loopReads.ts.
import type { Language } from '../theme';
import type { SceneView, ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import type { GreyFrame } from './tracker';
import type { Tracked } from './shelfTracks';
import type { ConversationEvent } from '../conversation/types';

export interface LoopPhoto {
  image: string;
  mime: string;
  w: number;
  h: number;
  grey: GreyFrame;
}

export interface LoopContext {
  lang: Language;
  alternative: string | null;
  checkedCount: number;
  guiding?: boolean;
  handCovering?: boolean;
  guideLost?: boolean;
  guideRecheck?: boolean;
}

export interface LoopCut {
  track: string;
  outline: ShelfOutline;
}

export interface LoopDeps {
  now: () => number;
  outline: (image: string, mime: string, phrase: string, w: number, h: number) => Promise<{ outlines: ShelfOutline[]; samMs: number; maskMs: number }>;
  fetchPhrase: (request: string, image: string, mime: string) => Promise<string>;
  read: (request: string, crops: ShelfCrop[]) => Promise<{ reads: ShelfRead[]; readMs: number }>;
  classify: (request: string, image: string, mime: string) => Promise<SceneView>;
  cutCrops: (image: string, tracks: LoopCut[]) => Promise<ShelfCrop[]>;
  readContext: () => LoopContext;
  send: (event: ConversationEvent) => void;
  log: (line: string) => void;
}

export interface LoopStats {
  samCalls: number;
  readCalls: number;
  readCrops: number;
  classifyCalls: number;
}

export interface LoopState {
  request: string;
  epoch: number;
  tracks: Tracked[];
  counter: number;
  phrases: Map<string, string>;
  cloudBusy: boolean;
  outlinedAt: number | null;
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
  turnRightNext: boolean;
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
  stats: () => LoopStats;
}
