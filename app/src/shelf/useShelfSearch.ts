// The shelf search loop on the phone: a fast track capture every
// quarter second moves the outlines with the phone, while cloud
// passes outline and read in the background without blocking it.
// Stills are silent (no shutter sound, no processing stall) and the
// native side deletes each one after decoding it.
import { useEffect, useRef } from 'react';
import { cropShelfPhoto, prepareShelfPhoto, prepareTrackGrey } from 'ittro-sensors';
import { classifySceneView, outlineShelf, fetchPackagePhrase, readShelfCrops } from '../relay';
import type { ShelfCrop } from '../relay';
import type { Language } from '../theme';
import { createShelfLoop } from './loop';
import type { LoopPhoto, ShelfLoop } from './loop';
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

const TRACK_EVERY_MS = 250;
const CLOUD_EVERY_MS = 500;

const SILENT_SHOT = { shutterSound: false, skipProcessing: true, exif: false };

export function useShelfSearch(
  camera: { current: SearchCamera | null },
  actor: { current: SearchActor | null },
  active: boolean,
  request: string | null,
): void {
  const held = useRef<{ loop: ShelfLoop | null; ring: LoopPhoto[] }>({ loop: null, ring: [] });

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

    async function trackTick(): Promise<void> {
      const eye = camera.current;
      if (stopped || !eye || shooting) {
        return;
      }
      shooting = true;
      try {
        syncTarget();
        const picture = await eye.takePictureAsync({ ...SILENT_SHOT });
        const track = await prepareTrackGrey(picture.uri);
        if (stopped || !track) {
          return;
        }
        loop.trackFrame(ingestGrey(decodeBase64(track.grey), track.gw, track.gh), track.pw);
      } catch {
        return;
      } finally {
        shooting = false;
      }
    }

    async function cloudTick(): Promise<void> {
      const eye = camera.current;
      if (stopped || !eye || shooting || !loop.cloudDue()) {
        return;
      }
      shooting = true;
      try {
        syncTarget();
        const picture = await eye.takePictureAsync({ ...SILENT_SHOT });
        const prepared = await prepareShelfPhoto(picture.uri);
        if (stopped || !prepared) {
          return;
        }
        let grey: GreyFrame = { data: new Uint8Array(0), w: 0, h: 0 };
        try {
          grey = ingestGrey(decodeBase64(prepared.grey), prepared.gw, prepared.gh);
        } catch {
          grey = { data: new Uint8Array(0), w: 0, h: 0 };
        }
        const ring = [...held.current.ring, { image: prepared.photo, mime: 'image/jpeg', grey }].slice(-3);
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
