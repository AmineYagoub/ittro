// The confirm loop on the phone: still photos through the shelf
// pipeline become in-hand verdicts and word-for-word details, with
// a working tick every two seconds until the verdict lands. The
// still is deleted after decoding; only its crop stays in memory
// for the verdict card, cleared when the check ends.
import { useEffect } from 'react';
import { cropShelfPhoto, prepareShelfPhoto } from 'ittro-sensors';
import { confirmInHand, readLabelDetail } from '../relay';
import { playSound } from '../speech';
import { logIttro } from '../log';
import type { SearchActor, SearchCamera } from '../shelf/useShelfSearch';
import { lastHandFix } from '../guide/frames';
import type { HandFix } from '../guide/types';
import type { ShelfBox } from '../relay';
import { createConfirmLoop } from './loop';

const TICK_EVERY_MS = 300;
const WORKING_TICK_MS = 2000;

export interface ConfirmCropBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function confirmCropBox(hand: HandFix | null, w: number, h: number, held: ShelfBox | null = null): ConfirmCropBox | null {
  if (!hand || !(w > 0) || !(h > 0)) {
    return null;
  }
  const side = Math.min(Math.max(hand.handWidth * 3, 360), Math.min(w, h));
  const half = side / 2;
  const cx = Math.min(Math.max(hand.x, half), w - half);
  const cy = Math.min(Math.max(hand.y, half), h - half);
  let x1 = cx - half;
  let y1 = cy - half;
  let x2 = cx + half;
  let y2 = cy + half;
  if (held && held.w > 0 && held.h > 0) {
    // The product's own box joins the hand's square: a hand on the cap
    // still sends the whole label.
    const sx = w / held.w;
    const sy = h / held.h;
    const pad = 0.08 * Math.max((held.x2 - held.x1) * sx, (held.y2 - held.y1) * sy);
    x1 = Math.min(x1, held.x1 * sx - pad);
    y1 = Math.min(y1, held.y1 * sy - pad);
    x2 = Math.max(x2, held.x2 * sx + pad);
    y2 = Math.max(y2, held.y2 * sy + pad);
  }
  return {
    x1: Math.max(0, Math.round(x1)),
    y1: Math.max(0, Math.round(y1)),
    x2: Math.min(w, Math.round(x2)),
    y2: Math.min(h, Math.round(y2)),
  };
}

export function useConfirm(
  camera: { current: SearchCamera | null },
  actor: { current: SearchActor | null },
  active: boolean,
  request: string | null,
  ready: { current: boolean },
): void {
  useEffect(() => {
    if (!active || !request) {
      return undefined;
    }
    const wanted: string = request;
    let stopped = false;
    const loop = createConfirmLoop({
      now: () => Date.now(),
      shoot: async () => {
        const eye = camera.current;
        if (!eye || !ready.current) {
          return null;
        }
        let uri: string | null = null;
        try {
          const start = Date.now();
          uri = await eye.takeShot();
          logIttro(`confirm capture ${Date.now() - start}ms`);
        } catch {
          return null;
        }
        if (!uri) {
          return null;
        }
        const prepared = await prepareShelfPhoto(uri);
        if (stopped || !prepared) {
          return null;
        }
        const full = { image: prepared.photo, mime: 'image/jpeg', crop: `data:image/jpeg;base64,${prepared.photo}` };
        const context = actor.current?.getSnapshot().context;
        if (context?.confirmVerdict === 'picture' || context?.confirmVerdict === 'unsure') {
          logIttro(`confirm full frame after ${context.confirmVerdict}`);
          return full;
        }
        const held = context?.confirmBox ?? null;
        const cut = confirmCropBox(lastHandFix(), prepared.w, prepared.h, held);
        if (!cut) {
          logIttro('confirm full frame, no hand fix');
          return full;
        }
        try {
          const cropped = await cropShelfPhoto(prepared.photo, cut.x1, cut.y1, cut.x2, cut.y2);
          if (!cropped) {
            logIttro('confirm crop failed, full frame');
            return full;
          }
          logIttro(`confirm crop ${cut.x2 - cut.x1}x${cut.y2 - cut.y1} around ${held ? 'product and hand' : 'hand'}`);
          return { image: cropped.image, mime: cropped.mime, crop: `data:${cropped.mime};base64,${cropped.image}` };
        } catch {
          logIttro('confirm crop failed, full frame');
          return full;
        }
      },
      confirm: (label, image, mime) => confirmInHand(label, image, mime),
      detail: (kind, image, mime) => readLabelDetail(kind, image, mime),
      readContext: () => {
        const context = actor.current?.getSnapshot().context;
        return {
          epoch: context?.confirmEpoch ?? 0,
          request: wanted,
          detailKind: context?.confirmDetailKind ?? null,
          final: context?.confirmFinal ?? true,
        };
      },
      handNow: () => lastHandFix(),
      send: (event) => {
        if (!stopped) {
          actor.current?.send(event);
        }
      },
      log: (line) => {
        logIttro(line);
      },
    });
    loop.begin();
    const tickTimer = setInterval(() => {
      if (!stopped) {
        loop.tick();
      }
    }, TICK_EVERY_MS);
    const soundTimer = setInterval(() => {
      const context = actor.current?.getSnapshot().context;
      if (!stopped && context && !context.confirmFinal) {
        playSound('workingTick');
      }
    }, WORKING_TICK_MS);
    return () => {
      stopped = true;
      clearInterval(tickTimer);
      clearInterval(soundTimer);
      loop.stop();
    };
  }, [active, request]);
}
