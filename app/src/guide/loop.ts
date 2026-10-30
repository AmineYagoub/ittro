// The guide loop, outside the statechart: every hand frame becomes
// at most one guide event. A new cue holds 0.4 s before it speaks,
// almost and covering are edges, a recent dropout is lost while a
// long absence is no hand, a rest on another product reads it, and
// contact needs the target moving with the hand. The clock, the
// photo and the cloud read are injected, so tests walk it with
// scripted frames and the phone drives it with live stills.
import type { ShelfBox, ShelfOutline } from '../relay';
import { linkKindFor } from '../metaCall';
import { linkEvent } from '../conversation/link';
import { boxOverlap } from '../shelf/outlines';
import { centerOf, cueIdFor, proximityFor, steerFor } from './steer';
import type { HandFix, TipPoint } from './types';
import { freshGuideState } from './loopTypes';
import type { GuideLoop, GuideLoopDeps, GuideLoopPhoto } from './loopTypes';

const CUE_HOLD_MS = 400;
const EDGE_HEARTBEAT_MS = 2000;
const LOST_WITHIN_MS = 2000;
const COVER_MS = 1000;
const REST_MS = 500;
const REST_RADIUS = 0.5;
const TARGET_MATCH_IOU = 0.3;
const TARGET_GONE_FRAMES = 2;
const CONTACT_POINTS = 4;
const CONTACT_SHIFT_PX = 6;
const CONTACT_ALIGN = 0.7;
const MIN_CONFIDENCE = 0.3;

function inside(tip: TipPoint, box: ShelfBox): boolean {
  return tip.x >= box.x1 && tip.x <= box.x2 && tip.y >= box.y1 && tip.y <= box.y2;
}

function cosine(a: TipPoint, b: TipPoint): number {
  const lengths = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  if (lengths <= 0) {
    return 0;
  }
  return (a.x * b.x + a.y * b.y) / lengths;
}

export function createGuideLoop(deps: GuideLoopDeps): GuideLoop {
  const state = freshGuideState();

  function trackTarget(outlines: ShelfOutline[], photoW: number): void {
    if (!state.target) {
      return;
    }
    let best: ShelfBox | null = null;
    let bestIoU = 0;
    for (const outline of outlines) {
      const score = boxOverlap(state.target, outline.box);
      if (score > bestIoU) {
        bestIoU = score;
        best = outline.box;
      }
    }
    if (best && bestIoU >= TARGET_MATCH_IOU) {
      if (state.sentTargetLost) {
        deps.log('guide target back in view');
      }
      state.target = best;
      state.targetGone = 0;
      state.sentTargetLost = false;
      return;
    }
    state.targetGone += 1;
    if (state.targetGone >= TARGET_GONE_FRAMES && !state.sentTargetLost) {
      state.sentTargetLost = true;
      deps.log('guide target out of view');
      const center = centerOf(state.target);
      const side = photoW > 0 && center.x < photoW / 2 ? 'left' : 'right';
      deps.send({ type: 'GUIDE_TARGET_LOST', cue: `phone_${side}_small` });
    }
  }

  function miss(): void {
    state.heldCue = null;
    state.sentAlmost = false;
    state.coverSince = null;
    state.sentCovering = false;
    state.sentContact = false;
    state.restAnchor = null;
    state.restRead = false;
    state.trail = [];
    const last = state.lastSeenAt;
    if (last === null || deps.now() - last >= LOST_WITHIN_MS) {
      if (!state.sentNoHand) {
        state.sentNoHand = true;
        state.sentLost = false;
        deps.send({ type: 'GUIDE_NOHAND' });
      }
      return;
    }
    if (!state.sentLost) {
      state.sentLost = true;
      state.sentNoHand = false;
      deps.send({ type: 'GUIDE_LOST' });
    }
  }

  function cueToward(tip: TipPoint, box: ShelfBox): string {
    const center = centerOf(box);
    if (Math.abs(tip.x - center.x) >= Math.abs(tip.y - center.y)) {
      return tip.x < center.x ? 'hand_right' : 'hand_left';
    }
    return tip.y < center.y ? 'hand_down' : 'hand_up';
  }

  async function restRead(tip: TipPoint, outlines: ShelfOutline[], target: ShelfBox, handWidth: number): Promise<void> {
    const anchor = state.restAnchor;
    if (!anchor || Math.hypot(tip.x - anchor.x, tip.y - anchor.y) > REST_RADIUS * handWidth) {
      state.restAnchor = { ...tip };
      state.restSince = deps.now();
      state.restRead = false;
      return;
    }
    if (state.restRead || deps.now() - state.restSince < REST_MS) {
      return;
    }
    state.restRead = true;
    const container = outlines.find((outline) => inside(tip, outline.box) && boxOverlap(outline.box, target) < 0.5) ?? null;
    const photo = state.photo;
    if (!container || !photo) {
      return;
    }
    const reading = state.restAnchor;
    try {
      const crop = await deps.cutCrop(photo.image, container.box);
      if (!crop) {
        return;
      }
      const answer = await deps.read(state.label, [crop]);
      deps.send({ type: 'LINK_OK' });
      const verdict = answer.reads[0];
      if (!verdict || verdict.verdict !== 'no') {
        return;
      }
      if (state.restAnchor !== reading || !state.restRead) {
        return;
      }
      const label = [verdict.brand_text, verdict.size_text].filter((part) => part && part.length > 0).join(' ') || verdict.spoken;
      const steer = steerFor(tip, target, handWidth);
      const cue = steer.kind === 'move' ? cueIdFor(steer.dir, steer.small, false) : cueToward(tip, target);
      deps.log(`guide rest read ${answer.readMs}ms verdict no label ${label}`);
      deps.send({ type: 'GUIDE_WRONG', label, cue });
    } catch (error) {
      deps.log(`guide rest read failed: ${String((error as Error)?.message ?? error)}`);
      deps.send(linkEvent(linkKindFor(error)));
    }
  }

  function contact(tip: TipPoint, target: ShelfBox): void {
    state.trail.push({ tip: { ...tip }, center: centerOf(target) });
    state.trail = state.trail.slice(-CONTACT_POINTS);
    if (state.sentContact || state.trail.length < CONTACT_POINTS) {
      return;
    }
    const first = state.trail[0] as { tip: TipPoint; center: TipPoint };
    const last = state.trail[state.trail.length - 1] as { tip: TipPoint; center: TipPoint };
    const tipShift = { x: last.tip.x - first.tip.x, y: last.tip.y - first.tip.y };
    const boxShift = { x: last.center.x - first.center.x, y: last.center.y - first.center.y };
    if (
      Math.hypot(tipShift.x, tipShift.y) >= CONTACT_SHIFT_PX &&
      Math.hypot(boxShift.x, boxShift.y) >= CONTACT_SHIFT_PX &&
      cosine(tipShift, boxShift) >= CONTACT_ALIGN
    ) {
      state.sentContact = true;
      deps.send({ type: 'GUIDE_CONTACT' });
    }
  }

  return {
    setTarget(outline: ShelfOutline, label = ''): void {
      state.target = outline.box;
      state.label = label;
      state.targetGone = 0;
      state.sentTargetLost = false;
      state.coverSince = null;
      state.sentCovering = false;
      state.sentContact = false;
    },

    setPhoto(photo: GuideLoopPhoto): void {
      state.photo = photo;
    },

    reset(): void {
      Object.assign(state, freshGuideState());
    },

    async handFrame(fix: HandFix | null, outlines: ShelfOutline[], photoW: number, photoH: number): Promise<void> {
      const target = state.target;
      if (!target) {
        return;
      }
      trackTarget(outlines, photoW);
      const tracked = state.target as ShelfBox;
      if (!fix || fix.confidence < MIN_CONFIDENCE) {
        miss();
        return;
      }
      state.lastSeenAt = deps.now();
      state.sentLost = false;
      state.sentNoHand = false;
      const tip = { x: fix.x, y: fix.y };
      const proximity = proximityFor(tip, tracked, Math.hypot(photoW, photoH));
      const steer = steerFor(tip, tracked, fix.handWidth);
      if (steer.kind === 'move') {
        state.sentAlmost = false;
        state.sentCovering = false;
        state.coverSince = null;
        state.sentContact = false;
        state.trail = [];
        const id = cueIdFor(steer.dir, steer.small, false);
        if (state.heldCue !== id) {
          state.heldCue = id;
          state.heldSince = deps.now();
        }
        if (deps.now() - state.heldSince >= CUE_HOLD_MS) {
          deps.send({ type: 'GUIDE_CUE', cue: id, proximity, hand: { x: tip.x, y: tip.y } });
        }
      } else if (steer.kind === 'almost') {
        state.heldCue = null;
        state.coverSince = null;
        state.sentCovering = false;
        state.sentContact = false;
        state.trail = [];
        if (!state.sentAlmost || deps.now() - state.sentAlmostAt >= EDGE_HEARTBEAT_MS) {
          state.sentAlmost = true;
          state.sentAlmostAt = deps.now();
          deps.send({ type: 'GUIDE_ALIGNED', proximity, hand: { x: tip.x, y: tip.y } });
        }
      } else {
        state.heldCue = null;
        state.sentAlmost = false;
        if (state.coverSince === null) {
          state.coverSince = deps.now();
        }
        if (
          deps.now() - state.coverSince >= COVER_MS &&
          (!state.sentCovering || deps.now() - state.sentCoveringAt >= EDGE_HEARTBEAT_MS)
        ) {
          state.sentCovering = true;
          state.sentCoveringAt = deps.now();
          deps.send({ type: 'GUIDE_COVERING', proximity, hand: { x: tip.x, y: tip.y } });
        }
        contact(tip, tracked);
      }
      await restRead(tip, outlines, tracked, fix.handWidth);
    },
  };
}
