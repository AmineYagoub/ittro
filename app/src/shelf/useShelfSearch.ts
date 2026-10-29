// The shelf search loop on the phone: a fast track capture every
// quarter second moves the outlines with the phone, while cloud
// passes outline and read in the background without blocking it.
// Stills are silent (no shutter sound, no processing stall) and the
// native side deletes each one after decoding it. Shots wait for the
// camera to report ready, so a fresh mount never takes a rejected
// picture; a failed capture retries silently while only a failed
// cloud pass tells the shopper. Every fortieth track tick logs its
// rate and cost, so the phone check reads frames per second, skipped
// ticks and heat straight from the log. Optional shot listeners hear
// each still: the hand tracker runs on the track still before it is
// deleted, and the guide loop caches the cloud photo for its crops.
import { useEffect, useRef } from 'react';
import { cropShelfPhoto, prepareShelfPhoto, prepareTrackGrey, thermalStatus } from 'ittro-sensors';
import { classifySceneView, outlineShelf, fetchPackagePhrase, readShelfCrops } from '../relay';
import type { ShelfCrop } from '../relay';
import type { Language } from '../theme';
import { createShelfLoop } from './loop';
import type { LoopPhoto, ShelfLoop } from './loopTypes';
import { decodeBase64, ingestGrey } from './tracker';
import type { GreyFrame } from './tracker';
import type { ConversationContext, ConversationEvent } from '../conversation/types';
import { stamp } from '../stamp';

export interface SearchCamera {
  takePictureAsync: (options: Record<string, unknown>) => Promise<{ uri: string }>;
}

export interface SearchActor {
  send: (event: ConversationEvent) => void;
  getSnapshot: () => { context: ConversationContext };
}

export interface ShotListeners {
  trackShot?: (uri: string) => Promise<void>;
  cloudShot?: (photo: { image: string; mime: string; w: number; h: number }) => void;
}

const TRACK_EVERY_MS = 250;
const CLOUD_EVERY_MS = 500;

const TRACK_SUMMARY_EVERY = 40;

const SILENT_SHOT = { shutterSound: false, skipProcessing: true, exif: false };

function percentile(sorted: number[], rank: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(rank * sorted.length))] as number;
}

export function useShelfSearch(
  camera: { current: SearchCamera | null },
  actor: { current: SearchActor | null },
  active: boolean,
  request: string | null,
  ready: { current: boolean },
  shots?: ShotListeners,
): void {
  const held = useRef<{ loop: ShelfLoop | null; ring: LoopPhoto[] }>({ loop: null, ring: [] });
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
          const cut = await cropShelfPhoto(image, entry.outline.box.x1, entry.outline.box.y1, entry.outline.box.x2, entry.outline.box.y2);
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
        };
      },
      send: (event) => {
        if (!stopped) {
          actor.current?.send(event);
        }
      },
      log: (line) => {
        if (__DEV__) console.log(`[ittro] ${stamp()} ${line}`);
      },
    });
    held.current = { loop, ring: [] };
    let stopped = false;
    let shooting = false;
    let captures: number[] = [];
    let pans = 0;
    let skipped = 0;
    let windowStart = Date.now();
    syncTarget();
    const trackTimer = setInterval(() => {
      void trackTick();
    }, TRACK_EVERY_MS);
    const cloudTimer = setInterval(() => {
      void cloudTick();
    }, CLOUD_EVERY_MS);
    void cloudTick();
    return () => {
      stopped = true;
      clearInterval(trackTimer);
      clearInterval(cloudTimer);
      held.current.loop?.reset();
      held.current.loop = null;
    };

    function syncTarget(): void {
      const context = actor.current?.getSnapshot().context;
      if (context) {
        loop.setTarget(wanted, context.searchEpoch);
      }
    }

    function note(line: string): void {
      if (__DEV__) console.log(`[ittro] ${stamp()} ${line}`);
    }

    function summarizeTracks(): void {
      const secs = (Date.now() - windowStart) / 1000;
      const ordered = [...captures].sort((a, b) => a - b);
      const heat = thermalStatus();
      note(
        `track ${(captures.length / Math.max(1, secs)).toFixed(1)}/s capture p50 ${percentile(ordered, 0.5)}ms p95 ${percentile(ordered, 0.95)}ms pan ${Math.round(pans / Math.max(1, captures.length))}ms skipped ${skipped} thermal ${heat === null ? 'unknown' : heat}`,
      );
      captures = [];
      pans = 0;
      skipped = 0;
      windowStart = Date.now();
    }

    async function trackTick(): Promise<void> {
      const eye = camera.current;
      if (stopped || !eye || !ready.current) {
        return;
      }
      if (shooting) {
        skipped += 1;
        return;
      }
      shooting = true;
      try {
        syncTarget();
        const shotStart = Date.now();
        const picture = await eye.takePictureAsync({ ...SILENT_SHOT });
        await shotsRef.current?.trackShot?.(picture.uri).catch(() => undefined);
        const track = await prepareTrackGrey(picture.uri);
        const shotMs = Date.now() - shotStart;
        if (stopped || !track) {
          return;
        }
        const panStart = Date.now();
        loop.trackFrame(ingestGrey(decodeBase64(track.grey), track.gw, track.gh), track.pw);
        captures.push(shotMs);
        pans += Date.now() - panStart;
        if (captures.length >= TRACK_SUMMARY_EVERY) {
          summarizeTracks();
        }
      } catch {
        return;
      } finally {
        shooting = false;
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
          uri = (await eye.takePictureAsync({ ...SILENT_SHOT })).uri;
        } catch (error) {
          note(`shelf capture failed: ${String((error as Error)?.message ?? error).slice(0, 80)}`);
          return;
        }
        const prepared = await prepareShelfPhoto(uri);
        if (stopped || !prepared) {
          return;
        }
        note(`shelf capture ${Date.now() - shotStart}ms photo ${prepared.w}x${prepared.h}`);
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
}
