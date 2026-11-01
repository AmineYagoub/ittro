// The shelf loop's ties to the phone: the relay calls it makes, the
// label crops cut on the phone, and what it reads from the
// conversation. useShelfSearch makes one set per search.
import { cameraPan, cropShelfPhoto } from 'ittro-sensors';
import { classifySceneView, findShelf, outlineShelf, fetchPackagePhrase, readShelfCrops } from '../relay';
import type { ShelfCrop } from '../relay';
import type { Language } from '../theme';
import { cachedPhrase, rememberPhrase } from './phraseCache';
import { CROP_MARGIN, expandBox } from './outlines';
import type { LoopDeps } from './loopTypes';
import type { SearchActor } from './useShelfSearch';
import { handCoversTarget } from '../conversation/searchTarget';
import { lastPlacedBox } from '../guide/placedBox';
import { logIttro } from '../log';

/** The loop's clock, cloud, crops and conversation for one search; nothing is sent once it stopped. */
export function searchDeps(actor: { current: SearchActor | null }, stopped: () => boolean): LoopDeps {
  return {
    now: () => Date.now(),
    pan: cameraPan,
    outline: outlineShelf,
    fetchPhrase: (wantedText, image, mime) => cachedPhrase(wantedText, image, mime, fetchPackagePhrase),
    keepPhrase: rememberPhrase,
    find: findShelf,
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
        handCovering: handCoversTarget(context?.guideHand ?? null, lastPlacedBox(Date.now()) ?? context?.guideTarget?.box ?? null),
        guideLost: context?.guideOutOfView ?? false,
        guideRecheck: context?.guideRecheck ?? false,
        guideBox: context?.guideTarget ? (lastPlacedBox(Date.now()) ?? context.guideTarget.box) : null,
      };
    },
    send: (event) => {
      if (!stopped()) {
        actor.current?.send(event);
      }
    },
    log: (line) => {
      logIttro(line);
    },
  };
}
