// The camera's own still source for questions about the view: when the
// shelf search has no fresh still, this waits for the camera to open
// (a question may turn it on) and takes one, retrying once when the
// search's own shot holds the camera.
import { useEffect } from 'react';
import { prepareShelfPhoto } from 'ittro-sensors';
import { setStillSource } from './stills';
import type { ViewStill } from './stills';
import type { SearchCamera } from './useShelfSearch';
import { logIttro } from '../log';

const CAMERA_WAIT_MS = 4000;
const CAMERA_POLL_MS = 150;
const SHOT_RETRY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shoot(camera: SearchCamera): Promise<ViewStill | null> {
  const uri = await camera.takeShot().catch(() => null);
  if (!uri) {
    return null;
  }
  const prepared = await prepareShelfPhoto(uri);
  return prepared ? { image: prepared.photo, mime: 'image/jpeg', w: prepared.w, h: prepared.h, at: Date.now() } : null;
}

/** Registers the camera as the still source while the app runs. */
export function useViewStill(camera: { current: SearchCamera | null }, ready: { current: boolean }): void {
  useEffect(() => {
    setStillSource(async () => {
      const started = Date.now();
      while (!ready.current && Date.now() - started < CAMERA_WAIT_MS) {
        await sleep(CAMERA_POLL_MS);
      }
      const eye = camera.current;
      if (!ready.current || !eye) {
        logIttro('view still: the camera did not open');
        return null;
      }
      const first = await shoot(eye);
      const still = first ?? (await sleep(SHOT_RETRY_MS).then(() => shoot(eye)));
      logIttro(`view still ${still ? `${still.w}x${still.h}` : 'failed'} ${Date.now() - started}ms`);
      return still;
    });
    return () => setStillSource(null);
  }, [camera, ready]);
}
