// The guide loop on the phone: live hand frames arrive as view
// events from the one camera, each cloud photo refreshes the loop's
// crops, and the proximity ticks run on their own timer between the
// spoken cues. The delegate is one setting, CPU until the benchmark
// says otherwise. Every fortieth hand frame logs its rate and cost,
// and one line carries the heat after five minutes of guiding.
import { useEffect, useMemo, useRef } from 'react';
import { Vibration } from 'react-native';
import { cropShelfPhoto, setHandDelegate, thermalStatus, validHandFrame } from 'ittro-sensors';
import type { HandFrame } from 'ittro-sensors';
import { readShelfCrops } from '../relay';
import { playSound } from '../speech';
import { stamp } from '../stamp';
import type { ShotListeners } from '../shelf/useShelfSearch';
import type { ConversationContext, ConversationEvent } from '../conversation/types';
import { createFrameStats, handFixFromEvent, noteHandFix } from './frames';
import type { FrameStats } from './frames';
import { createGuideLoop } from './loop';
import type { GuideLoop } from './loopTypes';
import { tickGapMs } from './steer';

export interface GuideActor {
  send: (event: ConversationEvent) => void;
  getSnapshot: () => { context: ConversationContext; value: unknown };
}

export interface GuideShots extends ShotListeners {
  onHandFrame: (frame: HandFrame) => void;
}

const HAND_SUMMARY_EVERY = 40;
const STILL_TICK_MS = 2000;
const IDLE_TICK_MS = 500;
const TICK_PULSE_MS = 30;
const HEAT_NOTE_MS = 300000;

const MOTION_STATES = new Set(['directing', 'almost', 'reaching']);

function note(line: string): void {
  if (__DEV__) console.log(`[ittro] ${stamp()} ${line}`);
}

export function useGuide(actor: { current: GuideActor | null }, active: boolean): GuideShots {
  const held = useRef<{ loop: GuideLoop | null; stats: FrameStats | null; targetKey: string; heatTimer: ReturnType<typeof setTimeout> | null }>({
    loop: null,
    stats: null,
    targetKey: '',
    heatTimer: null,
  });

  useEffect(() => {
    const stats = createFrameStats(() => Date.now());
    const loop = createGuideLoop({
      now: () => Date.now(),
      send: (event) => {
        if (event.type === 'GUIDE_CUE') {
          stats.noteCue();
        }
        actor.current?.send(event);
      },
      log: (line) => note(line),
      cutCrop: async (image, box) => {
        const cut = await cropShelfPhoto(image, box.x1, box.y1, box.x2, box.y2);
        return cut ? { id: 'hand-rest', ...cut } : null;
      },
      read: (label, crops) => readShelfCrops(label, crops),
    });
    held.current = { loop, stats, targetKey: '', heatTimer: null };
    note(`hand delegate cpu ${setHandDelegate('cpu') ? 'set' : 'missing'}`);
    return () => {
      held.current.loop?.reset();
      held.current.loop = null;
      held.current.stats = null;
      if (held.current.heatTimer) {
        clearTimeout(held.current.heatTimer);
        held.current.heatTimer = null;
      }
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

  return useMemo<GuideShots>(() => {
    function summarize(stats: FrameStats): void {
      const summary = stats.snapshot();
      const heat = thermalStatus();
      note(
        `hands ${summary.handsPerSecond.toFixed(1)}/s detect p50 ${summary.detectP50}ms p95 ${summary.detectP95}ms cue p50 ${summary.cueP50}ms dropped ${summary.dropped} thermal ${heat === null ? 'unknown' : heat}`,
      );
      stats.reset();
    }

    function heatWatch(): void {
      if (held.current.heatTimer) {
        return;
      }
      held.current.heatTimer = setTimeout(() => {
        held.current.heatTimer = null;
        const heat = thermalStatus();
        note(`hands guiding 5min thermal ${heat === null ? 'unknown' : heat}`);
      }, HEAT_NOTE_MS);
    }

    function restLoop(): void {
      if (held.current.targetKey !== '') {
        held.current.targetKey = '';
        held.current.loop?.reset();
      }
      if (held.current.heatTimer) {
        clearTimeout(held.current.heatTimer);
        held.current.heatTimer = null;
      }
    }

    return {
      cloudShot: (photo: { image: string; mime: string }): void => {
        held.current.loop?.setPhoto(photo);
      },
      onHandFrame: (frame: HandFrame): void => {
        const loop = held.current.loop;
        const stats = held.current.stats;
        const context = actor.current?.getSnapshot().context;
        if (!validHandFrame(frame)) {
          return;
        }
        const target = context?.guideTarget ?? null;
        noteHandFix(handFixFromEvent(frame, target?.box.w ?? 0, target?.box.h ?? 0, Date.now()));
        if (!loop || !stats || !context?.guiding) {
          if (!context?.guiding) {
            restLoop();
          }
          return;
        }
        if (!target) {
          return;
        }
        const key = `${target.frame}:${target.id}`;
        if (held.current.targetKey !== key) {
          held.current.targetKey = key;
          loop.setTarget(target, context.guideLabel);
        }
        heatWatch();
        stats.noteFrame(frame);
        const photoW = target.box.w;
        const photoH = target.box.h;
        void loop.handFrame(handFixFromEvent(frame, photoW, photoH, Date.now()), context.outlines, photoW, photoH);
        if (stats.frames() >= HAND_SUMMARY_EVERY) {
          summarize(stats);
        }
      },
    };
  }, []);
}
