// The confirm loop on the phone: still photos through the shelf
// pipeline become in-hand verdicts and word-for-word details, with
// a working tick every two seconds until the verdict lands. The
// still is deleted after decoding; only its crop stays in memory
// for the verdict card, cleared when the check ends.
import { useEffect } from 'react';
import { prepareShelfPhoto } from 'ittro-sensors';
import { confirmInHand, readLabelDetail } from '../relay';
import { playSound } from '../speech';
import { logIttro } from '../log';
import type { SearchActor, SearchCamera } from '../shelf/useShelfSearch';
import { lastHandFix } from '../guide/frames';
import { createConfirmLoop } from './loop';

const TICK_EVERY_MS = 300;
const WORKING_TICK_MS = 2000;

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
          uri = await eye.takeShot();
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
        return { image: prepared.photo, mime: 'image/jpeg', crop: `data:image/jpeg;base64,${prepared.photo}` };
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
