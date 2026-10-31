// The shelf search loop on the phone: native pan shifts arrive as
// camera view events and move the outlines with the phone, while
// cloud passes outline and read in the background without blocking
// it. Stills are silent (no shutter sound, no processing stall) and
// the native side deletes each one after decoding it. Shots wait for
// the camera to report ready, so a fresh mount never takes a rejected
// picture; a failed capture retries silently while only a failed
// cloud pass tells the shopper. Every fortieth pan logs its rate and
// cost, so the phone check reads pans per second, applied shifts and
// heat straight from the log. An optional shot listener hears each
// cloud photo, which the guide loop caches for its crops.
import { useEffect, useMemo, useRef } from 'react';
import { cropShelfPhoto, prepareShelfPhoto, thermalStatus, validTrackPan } from 'ittro-sensors';
import type { TrackPan } from 'ittro-sensors';
import { classifySceneView, outlineShelf, fetchPackagePhrase, readShelfCrops } from '../relay';
import type { ShelfCrop } from '../relay';
import type { Language } from '../theme';
import { speech } from '../theme';
import { playSound } from '../speech';
import { createShelfLoop } from './loop';
import type { LoopPhoto, ShelfLoop } from './loopTypes';
import { decodeBase64, ingestGrey } from './tracker';
import type { GreyFrame } from './tracker';
import { CROP_MARGIN, expandBox } from './outlines';
import type { ConversationContext, ConversationEvent } from '../conversation/types';
import { handCoversTarget } from '../conversation/searchTarget';
import { lastHandFix } from '../guide/frames';
import type { HandFix } from '../guide/types';
import { logIttro } from '../log';

export interface SearchCamera {
  takeShot: () => Promise<string | null>;
}

export interface SearchActor {
  send: (event: ConversationEvent) => void;
  getSnapshot: () => { context: ConversationContext };
}

export interface ShotListeners {
  cloudShot?: (photo: { image: string; mime: string; w: number; h: number }) => void;
}

export interface TrackShots {
  onTrackPan: (pan: TrackPan) => void;
}

interface PanStats {
  count: number;
  panMs: number[];
  applied: number;
  scenes: number;
  frozen: number;
  start: number;
}

export const HAND_PAN_FREEZE_MS = 500;

export function panFrozenByHand(hand: HandFix | null, now: number): boolean {
  return hand !== null && now - hand.atMs <= HAND_PAN_FREEZE_MS;
}

interface HeldSearch {
  loop: ShelfLoop | null;
  ring: LoopPhoto[];
  wanted: string;
  photoW: number;
  stats: PanStats;
}

const CLOUD_EVERY_MS = 500;

const TRACK_SUMMARY_EVERY = 40;

function freshStats(): PanStats {
  return { count: 0, panMs: [], applied: 0, scenes: 0, frozen: 0, start: Date.now() };
}

function percentile(sorted: number[], rank: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(rank * sorted.length))] as number;
}

function note(line: string): void {
  logIttro(line);
}

export function shouldTickForSearch(searching: boolean, guiding: boolean, confirming: boolean): boolean {
  return searching && !guiding && !confirming;
}

export function useShelfSearch(
  camera: { current: SearchCamera | null },
  actor: { current: SearchActor | null },
  active: boolean,
  request: string | null,
  ready: { current: boolean },
  shots?: ShotListeners,
): TrackShots {
  const held = useRef<HeldSearch>({ loop: null, ring: [], wanted: '', photoW: 0, stats: freshStats() });
  const shotsRef = useRef<ShotListeners | undefined>(shots);
  shotsRef.current = shots;

  useEffect(() => {
    if (!active || !request) {
      return undefined;
    }
    const wanted: string = request;
    const loop = createShelfLoop({
      now: () => Date.now(),
      outline: outlineShelf,
      fetchPhrase: fetchPackagePhrase,
      read: readShelfCrops,
      classify: classifySceneView,
      cutCrops: async (image, tracks) => {
        const crops: ShelfCrop[] = [];
        for (const entry of tracks) {
          const grown = expandBox(entry.outline.box, CROP_MARGIN);
          const cut = await cropShelfPhoto(image, grown.x1, grown.y1, grown.x2, grown.y2);
          if (cut) {
            crops.push({ id: `shelf-${entry.track}`, image: cut.image, mime: cut.mime });
          }
        }
        return crops;
      },
      readContext: () => {
        const context = actor.current?.getSnapshot().context;
        return {
          lang: (context?.lang ?? 'en') as Language,
          alternative: context?.alternative ?? null,
          checkedCount: context?.checkedCount ?? 0,
          guiding: context?.guiding ?? false,
          handCovering: handCoversTarget(context?.guideHand ?? null, context?.guideTarget?.box ?? null),
          guideLost: context?.guideOutOfView ?? false,
          guideRecheck: context?.guideRecheck ?? false,
        };
      },
      send: (event) => {
        if (!stopped) {
          actor.current?.send(event);
        }
      },
      log: (line) => {
        note(line);
      },
    });
    held.current = { loop, ring: [], wanted, photoW: 0, stats: freshStats() };
    let stopped = false;
    let shooting = false;
    syncTarget();
    const cloudTimer = setInterval(() => {
      void cloudTick();
    }, CLOUD_EVERY_MS);
    const soundTimer = setInterval(() => {
      const context = actor.current?.getSnapshot().context;
      if (context && shouldTickForSearch(context.searching, context.guiding, context.confirming)) {
        playSound('workingTick');
      }
    }, speech.workingTickEveryMs);
    void cloudTick();
    return () => {
      stopped = true;
      clearInterval(cloudTimer);
      clearInterval(soundTimer);
      held.current.loop?.reset();
      held.current.loop = null;
    };

    function syncTarget(): void {
      const context = actor.current?.getSnapshot().context;
      if (context) {
        loop.setTarget(wanted, context.searchEpoch);
      }
    }

    async function cloudTick(): Promise<void> {
      const eye = camera.current;
      if (stopped || !eye || !ready.current || shooting || !loop.cloudDue()) {
        return;
      }
      shooting = true;
      try {
        syncTarget();
        const shotStart = Date.now();
        let uri: string | null = null;
        try {
          uri = await eye.takeShot();
        } catch (error) {
          note(`shelf capture failed: ${String((error as Error)?.message ?? error).slice(0, 80)}`);
          return;
        }
        if (!uri) {
          return;
        }
        const prepared = await prepareShelfPhoto(uri);
        if (stopped || !prepared) {
          return;
        }
        note(`shelf capture ${Date.now() - shotStart}ms photo ${prepared.w}x${prepared.h}`);
        held.current.photoW = prepared.w;
        shotsRef.current?.cloudShot?.({ image: prepared.photo, mime: 'image/jpeg', w: prepared.w, h: prepared.h });
        let grey: GreyFrame = { data: new Uint8Array(0), w: 0, h: 0 };
        try {
          grey = ingestGrey(decodeBase64(prepared.grey), prepared.gw, prepared.gh);
        } catch {
          grey = { data: new Uint8Array(0), w: 0, h: 0 };
        }
        const ring = [...held.current.ring, { image: prepared.photo, mime: 'image/jpeg', w: prepared.w, h: prepared.h, grey }].slice(-3);
        held.current.ring = ring;
        shooting = false;
        await loop.cloudPass(ring, null);
      } catch (error) {
        loop.fail(error);
      } finally {
        shooting = false;
      }
    }
  }, [active, request]);

  return useMemo<TrackShots>(() => {
    function summarize(stats: PanStats): void {
      const secs = (Date.now() - stats.start) / 1000;
      const ordered = [...stats.panMs].sort((a, b) => a - b);
      const heat = thermalStatus();
      note(
        `track ${(stats.count / Math.max(1, secs)).toFixed(1)}/s pan p50 ${percentile(ordered, 0.5)}ms p95 ${percentile(ordered, 0.95)}ms applied ${stats.applied} frozen ${stats.frozen} scene ${stats.scenes} photo ${held.current.photoW} thermal ${heat === null ? 'unknown' : heat}`,
      );
      held.current.stats = freshStats();
    }

    return {
      onTrackPan: (pan: TrackPan): void => {
        if (!validTrackPan(pan)) {
          return;
        }
        const loop = held.current.loop;
        if (!loop) {
          return;
        }
        const context = actor.current?.getSnapshot().context;
        if (context) {
          loop.setTarget(held.current.wanted, context.searchEpoch);
        }
        const stats = held.current.stats;
        stats.count += 1;
        stats.panMs.push(pan.panMs);
        if (panFrozenByHand(lastHandFix(), Date.now())) {
          // The pan is measured on the whole frame, and a hand near
          // the lens is most of it: its motion read as the shelf
          // moving and dragged every outline after the hand. While
          // a hand is in view the outlines hold; the next SAM pass
          // re-anchors them.
          stats.frozen += 1;
          return;
        }
        if (pan.changed) {
          stats.scenes += 1;
        } else if (pan.dx !== 0 || pan.dy !== 0) {
          stats.applied += 1;
        }
        const photoW = held.current.photoW;
        if (photoW > 0) {
          loop.trackShift(pan.dx, pan.dy, pan.changed, photoW / pan.gw);
        } else {
          loop.trackShift(0, 0, pan.changed, 1);
        }
        if (stats.count >= TRACK_SUMMARY_EVERY) {
          summarize(stats);
        }
      },
    };
  }, []);
}
