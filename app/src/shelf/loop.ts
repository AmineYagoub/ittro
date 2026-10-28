// The shelf pass loop, both halves: the fast track path moves outlines
// several times a second from grey frames, while slow cloud passes
// outline and read in the background without blocking it. The clock,
// the frames and the cloud are injected, so tests walk the loop with
// simulated time and the phone drives it with real timers.
import type { Language } from '../theme';
import type { SceneView, ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import { createTracker, pickSharpest, sharpness, trackPan } from './tracker';
import type { GreyFrame, Tracker } from './tracker';
import { moveOutlines } from './outlines';
import { biggestFirst, needsRead, reconcileTracks } from './shelfTracks';
import type { Tracked } from './shelfTracks';
import { outlineSignature, packageKind } from './match';
import { QUIET_MS, maybeSwept, readBatch, reportEmpty, reportVerdicts } from './loopReads';
import type { ConversationEvent } from '../conversation/types';

export interface LoopPhoto {
  image: string;
  mime: string;
  grey: GreyFrame;
}

export interface LoopContext {
  lang: Language;
  alternative: string | null;
  checkedCount: number;
}

export interface LoopCut {
  track: string;
  outline: ShelfOutline;
}

export interface LoopDeps {
  now: () => number;
  outline: (image: string, mime: string, phrase: string) => Promise<{ outlines: ShelfOutline[]; samMs: number }>;
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
  tracker: Tracker;
  tracks: Tracked[];
  counter: number;
  phrases: Map<string, string>;
  cloudBusy: boolean;
  outlinedAt: number | null;
  sceneChanged: boolean;
  lastSignature: string;
  lastScene: string;
  failAt: number | null;
  classifyAt: number | null;
  emptyPasses: number;
  emptyOutlines: number;
  fruitlessPasses: number;
  sweptEpoch: number;
  foundKey: string;
  turnRightNext: boolean;
  stats: LoopStats;
}

export interface ShelfLoop {
  setTarget: (request: string, epoch: number) => void;
  reset: () => void;
  fail: (error: unknown) => void;
  busy: () => boolean;
  cloudDue: () => boolean;
  trackFrame: (grey: GreyFrame, photoW: number) => void;
  cloudPass: (photos: LoopPhoto[], hand?: ShelfCrop | null) => Promise<void>;
  stats: () => LoopStats;
}

const REFRESH_MS = 15000;
const EMPTY_BEFORE_CLEAR = 3;
const PRIORITY_BATCH = 2;
const TRACK_SHIFT = 12;

function freshState(): LoopState {
  return {
    request: '',
    epoch: -1,
    tracker: createTracker(),
    tracks: [],
    counter: 0,
    phrases: new Map(),
    cloudBusy: false,
    outlinedAt: null,
    sceneChanged: false,
    lastSignature: '',
    lastScene: '',
    failAt: null,
    classifyAt: null,
    emptyPasses: 0,
    emptyOutlines: 0,
    fruitlessPasses: 0,
    sweptEpoch: -1,
    foundKey: '',
    turnRightNext: true,
    stats: { samCalls: 0, readCalls: 0, readCrops: 0, classifyCalls: 0 },
  };
}

function searchReset(state: LoopState): void {
  state.tracker = createTracker();
  state.tracks = [];
  state.outlinedAt = null;
  state.sceneChanged = false;
  state.lastSignature = '';
  state.lastScene = '';
  state.emptyPasses = 0;
  state.emptyOutlines = 0;
  state.fruitlessPasses = 0;
  state.turnRightNext = true;
}

export function createShelfLoop(deps: LoopDeps): ShelfLoop {
  const state = freshState();

  function stale(epoch: number): boolean {
    return state.epoch !== epoch;
  }

  function nextId(): string {
    state.counter += 1;
    return `t${state.counter}`;
  }

  function fail(error: unknown): void {
    deps.log(`shelf pass failed: ${String((error as Error)?.message ?? error)}`);
    if (state.failAt === null || deps.now() - state.failAt > QUIET_MS) {
      state.failAt = deps.now();
      deps.send({ type: 'SEARCH_FAILED' });
    }
  }

  const ctx = { deps, state, stale };

  return {
    setTarget(request: string, epoch: number): void {
      if (state.request !== request || state.epoch !== epoch) {
        searchReset(state);
      }
      state.request = request;
      state.epoch = epoch;
    },

    reset(): void {
      searchReset(state);
      state.request = '';
      state.epoch = -1;
      state.cloudBusy = false;
    },

    fail,

    busy(): boolean {
      return state.cloudBusy;
    },

    cloudDue(): boolean {
      if (state.cloudBusy || state.request === '') {
        return false;
      }
      return state.outlinedAt === null || state.sceneChanged || deps.now() - state.outlinedAt >= REFRESH_MS;
    },

    trackFrame(grey: GreyFrame, photoW: number): void {
      if (grey.w === 0 || photoW <= 0) {
        return;
      }
      const pan = trackPan(state.tracker, grey, TRACK_SHIFT);
      if (!pan) {
        return;
      }
      if (pan.changed) {
        state.sceneChanged = true;
        return;
      }
      if (state.tracks.length === 0 || (pan.dx === 0 && pan.dy === 0)) {
        return;
      }
      const moved = moveOutlines(
        state.tracks.map((entry) => entry.outline),
        { dx: pan.dx, dy: pan.dy, scale: photoW / grey.w },
      );
      state.tracks = state.tracks.map((entry, at) => ({ ...entry, outline: moved[at] as ShelfOutline }));
      deps.send({ type: 'OUTLINES_MOVED', outlines: moved });
    },

    async cloudPass(photos: LoopPhoto[], hand: ShelfCrop | null = null): Promise<void> {
      if (photos.length === 0) {
        throw new Error('a shelf pass needs at least one frame');
      }
      if (state.cloudBusy) {
        return;
      }
      state.cloudBusy = true;
      const epoch = state.epoch;
      const request = state.request;
      try {
        const sharpest = photos[pickSharpest(photos.map((frame) => frame.grey))] as LoopPhoto;
        const picked = sharpness(sharpest.grey);
        let phrase = state.phrases.get(request);
        if (!phrase) {
          phrase = await deps.fetchPhrase(request, sharpest.image, sharpest.mime);
          if (stale(epoch)) {
            return;
          }
          state.phrases.set(request, phrase);
        }
        let outlined = await deps.outline(sharpest.image, sharpest.mime, phrase);
        state.stats.samCalls += 1;
        if (stale(epoch)) {
          return;
        }
        if (outlined.outlines.length === 0 && phrase.includes(' ')) {
          const shorter = phrase.trim().split(/\s+/).pop() as string;
          outlined = await deps.outline(sharpest.image, sharpest.mime, shorter);
          state.stats.samCalls += 1;
          deps.log(`shelf sam retry ${shorter} ${outlined.samMs}ms outlines ${outlined.outlines.length}`);
          if (stale(epoch)) {
            return;
          }
        }
        deps.log(`shelf sam ${outlined.samMs}ms outlines ${outlined.outlines.length} sharpness ${Math.round(picked)}`);
        state.outlinedAt = deps.now();
        state.sceneChanged = false;
        if (outlined.outlines.length === 0) {
          state.emptyOutlines += 1;
          if (state.emptyOutlines >= EMPTY_BEFORE_CLEAR && state.tracks.length > 0) {
            state.tracks = [];
            deps.send({ type: 'OUTLINES_MOVED', outlines: [] });
          }
          await reportEmpty(ctx, request, epoch, sharpest.image, phrase);
          return;
        }
        state.emptyOutlines = 0;
        state.tracks = reconcileTracks(state.tracks, outlined.outlines, nextId);
        const context = deps.readContext();
        const signature = outlineSignature(outlined.outlines);
        if (signature !== state.lastSignature) {
          state.lastSignature = signature;
          deps.send({ type: 'SHELF_OUTLINED', outlines: outlined.outlines, kind: packageKind(phrase, context.lang) });
        }
        if (hand) {
          const answer = await deps.read(request, [{ id: hand.id, image: hand.image, mime: hand.mime }]);
          if (stale(epoch)) {
            return;
          }
          state.stats.readCalls += 1;
          state.stats.readCrops += 1;
          const verdict = answer.reads[0]?.verdict ?? 'missing';
          deps.log(`shelf hand read ${answer.readMs}ms verdict ${verdict}`);
        }
        const needy = biggestFirst(needsRead(state.tracks));
        const passReads: ShelfRead[] = [];
        const priority = needy.slice(0, PRIORITY_BATCH);
        if (priority.length > 0) {
          passReads.push(...(await readBatch(ctx, request, epoch, sharpest.image, priority)));
          if (stale(epoch)) {
            return;
          }
          reportVerdicts(ctx, request, passReads, epoch);
        }
        const rest = needy.slice(PRIORITY_BATCH);
        if (rest.length > 0) {
          passReads.push(...(await readBatch(ctx, request, epoch, sharpest.image, rest)));
          if (stale(epoch)) {
            return;
          }
          reportVerdicts(ctx, request, passReads, epoch);
        }
        maybeSwept(ctx, passReads, epoch);
      } catch (error) {
        fail(error);
      } finally {
        state.cloudBusy = false;
      }
    },

    stats(): LoopStats {
      return { ...state.stats };
    },
  };
}
