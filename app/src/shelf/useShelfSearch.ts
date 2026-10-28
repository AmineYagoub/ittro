// The shelf search loop: while the statechart says searching, take a
// still every two seconds, outline it, read the crops, and report.
// Lines go out only when something changes; tracker pans refresh the
// outlines silently. Failures speak at most once every eight seconds.
import { useEffect, useRef } from 'react';
import { cropShelfPhoto, prepareShelfPhoto } from 'ittro-sensors';
import { classifySceneView, outlineShelf, fetchPackagePhrase, readShelfCrops } from '../relay';
import type { ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import type { Language } from '../theme';
import { runShelfPass } from './runner';
import type { PassFrame } from './runner';
import { createTracker, decodeBase64, ingestGrey, trackPan } from './tracker';
import type { GreyFrame, Tracker } from './tracker';
import { moveOutlines } from './outlines';
import { aisleFallback, findCloseMatch, outlineSignature, packageKind } from './match';
import type { ConversationContext, ConversationEvent } from '../conversation/types';
import { stamp } from '../stamp';

export interface SearchCamera {
  takePictureAsync: (options: Record<string, unknown>) => Promise<{ uri: string }>;
}

export interface SearchActor {
  send: (event: ConversationEvent) => void;
  getSnapshot: () => { context: ConversationContext };
}

interface RingPhoto {
  photo: string;
  grey: GreyFrame | null;
}

interface LoopState {
  running: boolean;
  ring: RingPhoto[];
  tracker: Tracker;
  phrases: Map<string, string>;
  lastSignature: string;
  lastScene: string;
  failAt: number;
  classifyAt: number;
  emptyPasses: number;
  fruitlessPasses: number;
  sweptEpoch: number;
  foundKey: string;
  turnLeft: boolean;
}

const PASS_EVERY_MS = 2000;
const FAIL_QUIET_MS = 8000;
const EMPTY_BEFORE_TURN = 2;
const EMPTY_BEFORE_SWEPT = 3;

function freshState(): LoopState {
  return {
    running: false,
    ring: [],
    tracker: createTracker(),
    phrases: new Map(),
    lastSignature: '',
    lastScene: '',
    failAt: 0,
    classifyAt: 0,
    emptyPasses: 0,
    fruitlessPasses: 0,
    sweptEpoch: -1,
    foundKey: '',
    turnLeft: false,
  };
}

export function useShelfSearch(
  camera: { current: SearchCamera | null },
  actor: { current: SearchActor | null },
  active: boolean,
  request: string | null,
): void {
  const held = useRef<LoopState>(freshState());

  useEffect(() => {
    if (!active || !request) {
      return undefined;
    }
    const current = held.current;
    let stopped = false;
    const timer = setInterval(() => {
      void pass();
    }, PASS_EVERY_MS);
    void pass();
    return () => {
      stopped = true;
      clearInterval(timer);
    };

    async function pass(): Promise<void> {
      const shot = actor.current;
      const eye = camera.current;
      if (stopped || !shot || !eye || current.running || !request) {
        return;
      }
      current.running = true;
      try {
        const epoch = shot.getSnapshot().context.searchEpoch;
        const photo = await capture(eye);
        if (stopped || !photo) {
          return;
        }
        carryOutlines(shot, current.tracker, photo);
        current.ring = [...current.ring, photo].slice(-3);
        const frames: PassFrame[] = current.ring.map((entry) => ({
          image: entry.photo,
          mime: 'image/jpeg',
          grey: entry.grey ?? { data: new Uint8Array(0), w: 0, h: 0 },
        }));
        const lang = shot.getSnapshot().context.lang;
        const result = await runShelfPass(
          {
            outline: outlineShelf,
            fetchPhrase: fetchPackagePhrase,
            read: readShelfCrops,
            cutCrops: (image, outlines) => cutOutlines(image, outlines),
            log: (line) => {
              if (__DEV__) console.log(`[ittro] ${stamp()} ${line}`);
            },
          },
          { request, frames, hand: null, epoch, phrases: current.phrases },
        );
        if (stopped || shot.getSnapshot().context.searchEpoch !== epoch) {
          return;
        }
        if (result.outlines.length > 0) {
          reportOutlines(shot, current, request, result.outlines, result.shelfReads, result.phrase, lang, epoch);
        } else {
          await reportEmpty(shot, current, request, photo.photo, result.phrase, lang, epoch);
        }
      } catch (err) {
        if (__DEV__) console.log(`[ittro] ${stamp()} shelf pass failed: ${String((err as Error)?.message ?? err)}`);
        const now = Date.now();
        if (now - current.failAt > FAIL_QUIET_MS) {
          current.failAt = now;
          actor.current?.send({ type: 'SEARCH_FAILED' });
        }
      } finally {
        current.running = false;
      }
    }
  }, [active, request]);
}

async function capture(eye: SearchCamera): Promise<RingPhoto | null> {
  const picture = await eye.takePictureAsync({ quality: 0.6 });
  const prepared = await prepareShelfPhoto(picture.uri);
  if (!prepared) {
    return null;
  }
  let grey: GreyFrame | null = null;
  try {
    grey = ingestGrey(decodeBase64(prepared.grey), prepared.gw, prepared.gh);
  } catch {
    grey = null;
  }
  return { photo: prepared.photo, grey };
}

function carryOutlines(shot: SearchActor, tracker: Tracker, photo: RingPhoto): void {
  const grey = photo.grey;
  if (!grey || grey.w === 0) {
    return;
  }
  const outlines = shot.getSnapshot().context.outlines;
  const first = outlines[0];
  const pan = trackPan(tracker, grey, 12);
  if (!pan || pan.changed || !first || (pan.dx === 0 && pan.dy === 0)) {
    return;
  }
  const moved = moveOutlines(outlines, { dx: pan.dx, dy: pan.dy, scale: first.box.w / grey.w });
  shot.send({ type: 'OUTLINES_MOVED', outlines: moved });
}

async function cutOutlines(image: string, outlines: ShelfOutline[]): Promise<ShelfCrop[]> {
  const crops: ShelfCrop[] = [];
  for (const outline of outlines) {
    const box = outline.box;
    const cut = await cropShelfPhoto(image, box.x1, box.y1, box.x2, box.y2);
    if (cut) {
      crops.push({ id: `shelf-${outline.id}`, image: cut.image, mime: cut.mime });
    }
  }
  return crops;
}

function reportOutlines(
  shot: SearchActor,
  current: LoopState,
  request: string,
  outlines: ShelfOutline[],
  reads: ShelfRead[],
  phrase: string,
  lang: Language,
  epoch: number,
): void {
  current.emptyPasses = 0;
  const signature = outlineSignature(outlines);
  if (signature !== current.lastSignature) {
    current.lastSignature = signature;
    shot.send({ type: 'SHELF_OUTLINED', outlines, kind: packageKind(phrase, lang) });
  }
  if (reads.some((read) => read.verdict === 'yes')) {
    current.fruitlessPasses = 0;
    const key = `${epoch}:${request}`;
    if (current.foundKey !== key) {
      current.foundKey = key;
      shot.send({ type: 'SHELF_FOUND', product: request });
    }
    return;
  }
  const close = findCloseMatch(request, reads);
  if (close && shot.getSnapshot().context.alternative !== close) {
    current.fruitlessPasses = 0;
    shot.send({ type: 'CLOSE_MATCH', wanted: request, found: close });
    return;
  }
  if (reads.length > 0 && reads.every((read) => read.verdict === 'no')) {
    current.fruitlessPasses += 1;
    const checked = shot.getSnapshot().context.checkedCount;
    if (current.fruitlessPasses >= EMPTY_BEFORE_SWEPT && current.sweptEpoch !== epoch && checked > 0) {
      current.fruitlessPasses = 0;
      current.sweptEpoch = epoch;
      shot.send({ type: 'SHELF_SWEPT', checked });
    }
  }
}

async function reportEmpty(
  shot: SearchActor,
  current: LoopState,
  request: string,
  photo: string,
  phrase: string,
  lang: Language,
  epoch: number,
): Promise<void> {
  current.emptyPasses += 1;
  const now = Date.now();
  if (now - current.classifyAt < FAIL_QUIET_MS) {
    return;
  }
  current.classifyAt = now;
  const scene = await classifySceneView(request, photo, 'image/jpeg');
  if (shot.getSnapshot().context.searchEpoch !== epoch) {
    return;
  }
  const key = `${scene.scene}:${scene.kinds.join(',')}`;
  if (scene.scene !== 'shelf') {
    if (current.lastScene !== key) {
      current.lastScene = key;
      shot.send({ type: 'NO_SHELF', floor: scene.scene === 'floor' });
    }
    return;
  }
  const kind = packageKind(phrase, lang);
  if (!scene.kinds.includes(kind) && !scene.kinds.includes(phrase.trim())) {
    if (current.lastScene !== key) {
      current.lastScene = key;
      shot.send({ type: 'WRONG_SHELF', kind, aisle: scene.aisle_hint ?? aisleFallback(lang) });
    }
    return;
  }
  if (current.emptyPasses >= EMPTY_BEFORE_TURN) {
    current.emptyPasses = 0;
    current.turnLeft = !current.turnLeft;
    shot.send({ type: 'SHELF_TURN', direction: current.turnLeft ? 'left' : 'right' });
  }
}
