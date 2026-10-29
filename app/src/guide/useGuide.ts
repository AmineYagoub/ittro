// The guide loop on the phone: each track still becomes one hand
// frame for the guide loop, each cloud photo refreshes its crops,
// and the proximity ticks run on their own timer between the spoken
// cues. The delegate is one setting, CPU until the benchmark says
// otherwise. Every fortieth hand tick logs its rate and cost, so the
// phone check reads hands per second straight from the log.
import { useEffect, useMemo, useRef } from 'react';
import { Vibration } from 'react-native';
import { cropShelfPhoto, findHand, setHandDelegate } from 'ittro-sensors';
import { readShelfCrops } from '../relay';
import { playSound } from '../speech';
import { stamp } from '../stamp';
import type { ShotListeners } from '../shelf/useShelfSearch';
import type { ConversationContext, ConversationEvent } from '../conversation/types';
import { createGuideLoop } from './loop';
import type { GuideLoop } from './loopTypes';
import { tickGapMs } from './steer';

export interface GuideActor {
  send: (event: ConversationEvent) => void;
  getSnapshot: () => { context: ConversationContext; value: unknown };
}

const HAND_SUMMARY_EVERY = 40;
const STILL_TICK_MS = 2000;
const IDLE_TICK_MS = 500;
const TICK_PULSE_MS = 30;

const MOTION_STATES = new Set(['directing', 'almost', 'reaching']);

function percentile(sorted: number[], rank: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(rank * sorted.length))] as number;
}

function note(line: string): void {
  if (__DEV__) console.log(`[ittro] ${stamp()} ${line}`);
}

export function useGuide(actor: { current: GuideActor | null }, active: boolean): ShotListeners {
  const held = useRef<{ loop: GuideLoop | null; targetKey: string }>({ loop: null, targetKey: '' });
  const stats = useRef<{ frames: number; ms: number[]; skipped: number; busy: boolean; start: number }>({
    frames: 0,
    ms: [],
    skipped: 0,
    busy: false,
    start: Date.now(),
  });

  useEffect(() => {
    const loop = createGuideLoop({
      now: () => Date.now(),
      send: (event) => {
        actor.current?.send(event);
      },
      log: (line) => note(line),
      cutCrop: async (image, box) => {
        const cut = await cropShelfPhoto(image, box.x1, box.y1, box.x2, box.y2);
        return cut ? { id: 'hand-rest', ...cut } : null;
      },
      read: (label, crops) => readShelfCrops(label, crops),
    });
    held.current = { loop, targetKey: '' };
    note(`hand delegate cpu ${setHandDelegate('cpu') ? 'set' : 'missing'}`);
    return () => {
      held.current.loop?.reset();
      held.current.loop = null;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = (): void => {
      if (stopped) {
        return;
      }
      const snapshot = actor.current?.getSnapshot();
      const value = snapshot?.value;
      const guide = typeof value === 'string' ? value : (value as { live?: { guide?: string } }).live?.guide ?? 'idle';
      const context = snapshot?.context;
      if (!context?.guiding) {
        timer = setTimeout(tick, IDLE_TICK_MS);
        return;
      }
      if (MOTION_STATES.has(guide)) {
        playSound('proximityTick');
        Vibration.vibrate(TICK_PULSE_MS);
        timer = setTimeout(tick, tickGapMs(context.guideProximity));
        return;
      }
      if (guide !== 'idle') {
        playSound('workingTick');
      }
      timer = setTimeout(tick, guide === 'idle' ? IDLE_TICK_MS : STILL_TICK_MS);
    };
    timer = setTimeout(tick, IDLE_TICK_MS);
    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [active]);

  return useMemo<ShotListeners>(() => {
    function summarize(): void {
      const current = stats.current;
      const secs = (Date.now() - current.start) / 1000;
      const ordered = [...current.ms].sort((a, b) => a - b);
      note(
        `hands ${(current.frames / Math.max(1, secs)).toFixed(1)}/s detect p50 ${percentile(ordered, 0.5)}ms p95 ${percentile(ordered, 0.95)}ms skipped ${current.skipped}`,
      );
      current.frames = 0;
      current.ms = [];
      current.skipped = 0;
      current.start = Date.now();
    }

    return {
      trackShot: async (uri: string): Promise<void> => {
        const loop = held.current.loop;
        const context = actor.current?.getSnapshot().context;
        if (!loop || !context?.guiding) {
          if (loop && held.current.targetKey !== '') {
            held.current.targetKey = '';
            loop.reset();
          }
          return;
        }
        const target = context.guideTarget;
        if (!target) {
          return;
        }
        const key = `${target.frame}:${target.id}`;
        if (held.current.targetKey !== key) {
          held.current.targetKey = key;
          loop.setTarget(target, context.guideLabel);
        }
        if (stats.current.busy) {
          stats.current.skipped += 1;
          return;
        }
        stats.current.busy = true;
        try {
          const found = await findHand(uri);
          stats.current.frames += 1;
          if (found) {
            stats.current.ms.push(found.detectMs);
          }
          const photoW = target.box.w;
          const photoH = target.box.h;
          const fix = found
            ? { x: found.x * photoW, y: found.y * photoH, confidence: found.confidence, handWidth: found.handWidth * photoW, atMs: Date.now() }
            : null;
          await loop.handFrame(fix, context.outlines, photoW, photoH);
          if (stats.current.frames >= HAND_SUMMARY_EVERY) {
            summarize();
          }
        } finally {
          stats.current.busy = false;
        }
      },
      cloudShot: (photo: { image: string; mime: string }): void => {
        held.current.loop?.setPhoto(photo);
      },
    };
  }, []);
}
