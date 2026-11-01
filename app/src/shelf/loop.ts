// The shelf pass loop, both halves: the fast track path moves outlines
// several times a second from native pan shifts, while slow cloud
// passes outline and read in the background without blocking it. The
// clock, the frames and the cloud are injected, so tests walk the
// loop with simulated time and the phone drives it with real timers.
import type { ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import { linkKindFor } from '../metaCall';
import { pickSharpest, sharpness } from './tracker';
import { anchorOutlines, moveOutlines } from './outlines';
import { biggestFirst, needsRead, reconcileTracks } from './shelfTracks';
import { outlineSignature, packageKind } from './match';
import { QUIET_MS, maybeSwept, readBatch, reportEmpty, reportRefind, reportVerdicts, targetJumped } from './loopReads';
import type { LoopDeps, LoopPhoto, LoopState, LoopStats, ShelfLoop } from './loopTypes';

const REFRESH_MS = 15000;
// An unsure label is read again from the next sharp frame soon after (t9:
// 3.4 s between an unsure read and the next try).
const REREAD_MS = 1200;
const EMPTY_BEFORE_CLEAR = 3;
const PRIORITY_BATCH = 2;
const READ_MIN_SHARPNESS = 800;
const BLURRY_SKIP_MAX = 2;

function freshState(): LoopState {
  return {
    request: '',
    epoch: -1,
    tracks: [],
    counter: 0,
    phrases: new Map(),
    phraseWait: null,
    cloudBusy: false,
    outlinedAt: null,
    readAt: null,
    sceneChanged: false,
    lastSignature: '',
    lastScene: '',
    failAt: null,
    classifyAt: null,
    emptyPasses: 0,
    emptyOutlines: 0,
    fruitlessPasses: 0,
    blurrySkips: 0,
    sweptEpoch: -1,
    foundKey: '',
    foundTrack: null,
    foundOutline: null,
    crops: new Map(),
    turnRightNext: true,
    stats: { samCalls: 0, readCalls: 0, readCrops: 0, classifyCalls: 0 },
  };
}

function searchReset(state: LoopState): void {
  state.tracks = [];
  state.outlinedAt = null;
  state.readAt = null;
  state.sceneChanged = false;
  state.lastSignature = '';
  state.lastScene = '';
  state.emptyPasses = 0;
  state.emptyOutlines = 0;
  state.fruitlessPasses = 0;
  state.blurrySkips = 0;
  state.foundTrack = null;
  state.foundOutline = null;
  state.phraseWait = null;
  state.crops.clear();
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
      if (state.outlinedAt === null || state.sceneChanged || deps.now() - state.outlinedAt >= REFRESH_MS) {
        return true;
      }
      return (
        needsRead(state.tracks).length > 0 && (state.readAt === null || deps.now() - state.readAt >= REREAD_MS)
      );
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
        const scored = sharpest.grey.data.length > 0;
        if (scored && picked < READ_MIN_SHARPNESS && state.blurrySkips < BLURRY_SKIP_MAX) {
          // The phrase names the package, which a blurry frame still shows:
          // ask for it now rather than after the sharp frame (t9: 2.8 s).
          if (!state.phrases.has(request) && !state.phraseWait) {
            const asked = request;
            state.phraseWait = deps.fetchPhrase(asked, sharpest.image, sharpest.mime).then((found) => {
              state.phrases.set(asked, found);
              return found;
            });
            state.phraseWait.catch(() => {
              state.phraseWait = null;
            });
          }
          state.blurrySkips += 1;
          deps.log(`shelf frame too blurry for a read (${Math.round(picked)}), waiting for a sharper one`);
          return;
        }
        state.blurrySkips = 0;
        let phrase = state.phrases.get(request);
        if (!phrase && state.phraseWait) {
          phrase = await state.phraseWait.catch(() => undefined);
          state.phraseWait = null;
        }
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
        outlined = { ...outlined, outlines: anchorOutlines(outlined.outlines, sharpest.shot) };
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
        const verifying =
          context.guiding && !context.handCovering && (context.guideLost || context.guideRecheck || targetJumped(state));
        if (context.guiding && !verifying) {
          if (context.handCovering) {
            deps.log('shelf target held under hand');
          } else {
            // The product is found and the hand is being guided: the
            // outlines still refresh, but settled labels are not read
            // again every pass (13 reads in 40 s on the phone, each
            // 2.3 to 4.7 s, all against the budget and the confirm).
            deps.log('shelf reads paused while guiding');
          }
          deps.send({ type: 'LINK_OK' });
          return;
        }
        if (verifying) {
          deps.log('shelf target recheck, reading to confirm');
        }
        const needy = verifying ? biggestFirst(state.tracks) : biggestFirst(needsRead(state.tracks));
        const passReads: ShelfRead[] = [];
        const priority = needy.slice(0, PRIORITY_BATCH);
        if (priority.length > 0) {
          passReads.push(...(await readBatch(ctx, request, epoch, sharpest.image, priority)));
          if (stale(epoch)) {
            return;
          }
          if (verifying) {
            reportRefind(ctx, request, passReads, epoch);
          } else {
            reportVerdicts(ctx, request, passReads, epoch);
          }
        }
        const rest = needy.slice(PRIORITY_BATCH);
        if (rest.length > 0) {
          passReads.push(...(await readBatch(ctx, request, epoch, sharpest.image, rest)));
          if (stale(epoch)) {
            return;
          }
          if (verifying) {
            reportRefind(ctx, request, passReads, epoch);
          } else {
            reportVerdicts(ctx, request, passReads, epoch);
          }
        }
        if (!verifying) {
          maybeSwept(ctx, passReads, epoch);
        }
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
