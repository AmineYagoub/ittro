// The shelf pass loop, both halves: the fast track path moves outlines
// several times a second from native pan shifts, while slow cloud
// passes outline and read in the background without blocking it. The
// clock, the frames and the cloud are injected, so tests walk the
// loop with simulated time and the phone drives it with real timers.
// While the hand is guided to the found product the outlines still
// refresh, but settled labels are not read again every pass (13 reads
// in 40 s on the phone, each 2.3 to 4.7 s, against the budget and the
// confirm), and once the phone rests after a move the outline is cut
// again from a still taken since (recut.ts: t31's slid half a bottle).
// While guiding with a hand near the product no pass runs, and
// outlines a hand touches are dropped: SAM would cut the hand in
// (t34). Another search starts a fresh shelf inventory.
import type { ShelfCrop, ShelfRead } from '../relay';
import { linkKindFor } from '../metaCall';
import { pickSharpest, sharpness } from './tracker';
import { anchorOutlines } from './outlines';
import { biggestFirst, needsRead, reconcileTracks } from './shelfTracks';
import { outlineSignature, packageKind } from './match';
import { QUIET_MS, maybeSwept, prefetchPhrase, readBatch, reportEmpty, reportRefind, reportVerdicts, targetJumped } from './loopReads';
import type { LoopDeps, LoopPhoto, LoopStats, ShelfLoop } from './loopTypes';
import { freshState, searchReset } from './loopState';
import { runCarried, seedCarry, takeCarry } from './carry';
import { findPass } from './loopFind';
import { afterSweepRead, stopPhotos, tickSweep } from './loopSweep';
import { sweepDue } from './sweep';
import { seenFor } from './inventory';
import { guideStills, reanchorDue, readsDue, recutDue, recutPhotos } from './recut';
import { handBlocks, handFreeCut } from './handClear';
import { placer, shiftTracks } from './place';

const REFRESH_MS = 15000;
// An unsure label is read again from the next sharp frame soon after (t9:
// 3.4 s between an unsure read and the next try).
const REREAD_MS = 1200;
const EMPTY_BEFORE_CLEAR = 3;
const PRIORITY_BATCH = 2;
const READ_MIN_SHARPNESS = 800;
// The find reads whole packages, not small crops: t20 read GUEDILA and
// Messäd at 724 and 772, after waiting 2 s for frames over 800.
const FIND_MIN_SHARPNESS = 600;
const BLURRY_SKIP_MAX = 2;

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
        seenFor(`${epoch}:${request}`);
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
      if (deps.readContext().guiding && handBlocks(deps)) {
        return false;
      }
      const swept = state.foundTrack === null ? sweepDue(state.sweep, deps.now()) : null;
      if (swept !== null) {
        return swept;
      }
      if (state.outlinedAt === null || state.sceneChanged || deps.now() - state.outlinedAt >= REFRESH_MS) {
        return true;
      }
      return (
        recutDue(ctx) || readsDue(ctx, needsRead(state.tracks).length > 0 && (state.readAt === null || deps.now() - state.readAt >= REREAD_MS))
      );
    },

    trackShift(dx: number, dy: number, changed: boolean, scale: number): void {
      shiftTracks(deps, state, { dx, dy, scale }, changed);
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
      const outlinedBefore = state.outlinedAt;
      try {
        await pass();
        if (state.outlinedAt !== outlinedBefore) {
          await afterSweepRead(ctx, request, epoch);
        }
      } catch (error) {
        fail(error);
      } finally {
        state.cloudBusy = false;
      }

      async function pass(): Promise<void> {
        const usable = guideStills(ctx, recutPhotos(state, stopPhotos(state, photos)));
        if (usable.length === 0) {
          deps.log(deps.readContext().guiding ? 'shelf pass waits for a fresh still without a hand' : 'shelf stop waits for a still taken once the camera settled');
          return;
        }
        const sharpest = usable[pickSharpest(usable.map((frame) => frame.grey))] as LoopPhoto;
        state.lastStill = sharpest;
        const picked = sharpness(sharpest.grey);
        const scored = sharpest.grey.data.length > 0;
        const findable = deps.find !== undefined && !hand && !deps.readContext().guiding;
        if (scored && picked < (findable ? FIND_MIN_SHARPNESS : READ_MIN_SHARPNESS) && state.blurrySkips < BLURRY_SKIP_MAX) {
          prefetchPhrase(ctx, request, sharpest);
          state.blurrySkips += 1;
          deps.log(`shelf frame too blurry for a read (${Math.round(picked)}), waiting for a sharper one`);
          return;
        }
        state.blurrySkips = 0;
        if (findable && (await findPass(ctx, request, epoch, sharpest, nextId, picked))) {
          if (!stale(epoch)) {
            deps.send({ type: 'LINK_OK' });
          }
          return;
        }
        if (stale(epoch)) {
          return;
        }
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
          if (outlined.outlines.length > 0) {
            state.phrases.set(request, shorter);
            deps.keepPhrase?.(request, shorter);
          }
        }
        outlined = { ...outlined, outlines: anchorOutlines(outlined.outlines, sharpest.shot) };
        const clear = handFreeCut(deps, outlined.outlines, sharpest.handBox);
        if (!clear) {
          state.outlinedAt = deps.now();
          return;
        }
        outlined = { ...outlined, outlines: clear };
        const masked = outlined.outlines.filter((outline) => outline.mask).length;
        deps.log(
          `shelf sam ${outlined.samMs}ms masks ${outlined.maskMs}ms outlines ${outlined.outlines.length} masked ${masked} sharpness ${Math.round(picked)}`,
        );
        state.outlinedAt = deps.now();
        state.outlinedPan = sharpest.pan ?? null;
        const reanchor = reanchorDue(ctx, outlined.outlines);
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
        state.tracks = reconcileTracks(state.tracks, outlined.outlines, nextId, placer(deps));
        const context = deps.readContext();
        const signature = outlineSignature(outlined.outlines);
        if (signature !== state.lastSignature) {
          state.lastSignature = signature;
          deps.send({ type: 'SHELF_OUTLINED', outlines: outlined.outlines, now: outlined.outlines.map(placer(deps)), kind: packageKind(phrase, context.lang) });
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
          context.guiding && !context.handCovering && (reanchor || context.guideLost || context.guideRecheck || targetJumped(state, placer(deps)));
        if (context.guiding && !verifying) {
          deps.log(context.handCovering ? 'shelf target held under hand' : 'shelf reads paused while guiding');
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
            reportRefind(ctx, request, passReads, epoch, reanchor);
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
            reportRefind(ctx, request, passReads, epoch, reanchor);
          } else {
            reportVerdicts(ctx, request, passReads, epoch);
          }
        }
        if (!verifying) {
          await maybeSwept(ctx, request, passReads, epoch);
        }
        deps.send({ type: 'LINK_OK' });
      }
    },

    carry(pan) {
      return takeCarry(state, pan, deps.now());
    },

    seed(carry, pan) {
      return seedCarry(ctx, carry, pan);
    },

    carriedPass() {
      return runCarried(ctx);
    },

    sweepTick() {
      tickSweep(ctx);
    },

    stats(): LoopStats {
      return { ...state.stats };
    },
  };
}
