// The shelf pass loop, both halves: the fast track path moves outlines
// several times a second from native pan shifts, while slow cloud
// passes outline and read in the background without blocking it. The
// clock, the frames and the cloud are injected, so tests walk the
// loop with simulated time and the phone drives it with real timers.
import type { ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import { linkKindFor } from '../metaCall';
import { pickSharpest, sharpness } from './tracker';
import { moveOutlines } from './outlines';
import { biggestFirst, needsRead, reconcileTracks } from './shelfTracks';
import { outlineSignature, packageKind } from './match';
import { QUIET_MS, maybeSwept, readBatch, reportEmpty, reportVerdicts } from './loopReads';
import type { LoopDeps, LoopPhoto, LoopState, LoopStats, ShelfLoop } from './loopTypes';

const REFRESH_MS = 15000;
const EMPTY_BEFORE_CLEAR = 3;
const PRIORITY_BATCH = 2;

function freshState(): LoopState {
  return {
    request: '',
    epoch: -1,
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
      deps.send({ type: 'SEARCH_FAILED', kind: linkKindFor(error) });
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

    trackShift(dx: number, dy: number, changed: boolean, scale: number): void {
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(scale > 0)) {
        return;
      }
      if (changed) {
        state.sceneChanged = true;
        return;
      }
      if (state.tracks.length === 0 || (dx === 0 && dy === 0)) {
        return;
      }
      const moved = moveOutlines(
        state.tracks.map((entry) => entry.outline),
        { dx, dy, scale },
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
        let outlined = await deps.outline(sharpest.image, sharpest.mime, phrase, sharpest.w, sharpest.h);
        state.stats.samCalls += 1;
        if (stale(epoch)) {
          return;
        }
        if (outlined.outlines.length === 0 && phrase.includes(' ')) {
          const shorter = phrase.trim().split(/\s+/).pop() as string;
          outlined = await deps.outline(sharpest.image, sharpest.mime, shorter, sharpest.w, sharpest.h);
          state.stats.samCalls += 1;
          deps.log(`shelf sam retry ${shorter} ${outlined.samMs}ms outlines ${outlined.outlines.length}`);
          if (stale(epoch)) {
            return;
          }
        }
        const masked = outlined.outlines.filter((outline) => outline.mask).length;
        deps.log(
          `shelf sam ${outlined.samMs}ms masks ${outlined.maskMs}ms outlines ${outlined.outlines.length} masked ${masked} sharpness ${Math.round(picked)}`,
        );
        state.outlinedAt = deps.now();
        state.sceneChanged = false;
        if (outlined.outlines.length === 0) {
          state.emptyOutlines += 1;
          if (state.emptyOutlines >= EMPTY_BEFORE_CLEAR && state.tracks.length > 0) {
            state.tracks = [];
            deps.send({ type: 'OUTLINES_MOVED', outlines: [] });
          }
          await reportEmpty(ctx, request, epoch, sharpest.image, phrase);
          deps.send({ type: 'LINK_OK' });
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
        deps.send({ type: 'LINK_OK' });
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
