// The confirm loop, outside the statechart: still photos become
// cloud reads, each answered in the moment it was taken. A shot
// waits 1.2 s after the last, at most five per check, and an answer
// lands only when its epoch is current and the hand has not moved
// since the photo. Failures retry on their own; the statechart
// speaks them once.
import type { ConfirmAttrs, ConfirmRead } from '../relay';
import { linkKindFor } from '../metaCall';
import type { ConversationEvent } from '../conversation/types';
import type { HandFix } from '../guide/types';
import { freshConfirmState } from './loopTypes';
import type { ConfirmLoop, ConfirmLoopContext, ConfirmLoopDeps, ConfirmPhoto } from './loopTypes';

const SHOT_GAP_MS = 1200;
const FAIL_GAP_MS = 4000;
const MAX_TRIES = 5;
const MAX_FLIGHT = 1;
const MOVE_PX = 80;

function readValues(read: ConfirmAttrs): string[] {
  return [read.brand, read.product, read.variant, read.size].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

function movedSince(shot: HandFix | null, now: HandFix | null): boolean {
  if (!shot || !now) {
    return false;
  }
  return Math.hypot(now.x - shot.x, now.y - shot.y) > MOVE_PX;
}

export function createConfirmLoop(deps: ConfirmLoopDeps): ConfirmLoop {
  const state = freshConfirmState();

  function failed(epoch: number, what: string, error: unknown): void {
    state.flight -= 1;
    state.tries -= 1;
    state.lastShotAt = deps.now() + (FAIL_GAP_MS - SHOT_GAP_MS);
    deps.log(`confirm ${what} failed, retrying`);
    const now = deps.readContext();
    if (state.active && now.epoch === epoch && !now.final) {
      deps.send({ type: 'CONFIRM_FAILED', kind: what === 'shot' ? 'broken' : linkKindFor(error) });
    }
  }

  function verdictEvent(epoch: number, photo: ConfirmPhoto, read: ConfirmRead): ConversationEvent {
    if (read.verdict === 'yes') {
      return { type: 'CONFIRM_YES', epoch, label: read.label_name, crop: photo.crop };
    }
    if (read.verdict === 'no') {
      return { type: 'CONFIRM_NO', epoch, label: read.label_name, crop: photo.crop };
    }
    if (read.verdict === 'picture' && read.picture_problem) {
      return { type: 'CONFIRM_PICTURE', epoch, problem: read.picture_problem };
    }
    return {
      type: 'CONFIRM_UNSURE',
      epoch,
      label: read.label_name,
      crop: photo.crop,
      read: readValues(read.read),
      missing: read.unreadable,
    };
  }

  async function shoot(ctx: ConfirmLoopContext): Promise<void> {
    state.tries += 1;
    state.flight += 1;
    state.lastShotAt = deps.now();
    const epoch = ctx.epoch;
    const hand = deps.handNow();
    const detail = ctx.detailKind;
    const request = ctx.request;
    let photo: ConfirmPhoto | null = null;
    try {
      photo = await deps.shoot();
    } catch (error) {
      photo = null;
      failed(epoch, 'shot', error);
      return;
    }
    if (!photo) {
      failed(epoch, 'shot', null);
      return;
    }
    if (detail) {
      try {
        const answer = await deps.detail(detail, photo.image, photo.mime);
        state.flight -= 1;
        if (!state.active) {
          return;
        }
        const now = deps.readContext();
        if (now.epoch !== epoch || now.final) {
          return;
        }
        if (movedSince(hand, deps.handNow())) {
          deps.log('confirm answer dropped: hand moved');
          deps.send({ type: 'CONFIRM_MOVED', epoch });
          return;
        }
        deps.log(`confirm detail ${answer.readMs}ms text ${answer.read.text === null ? 'unread' : 'read'}`);
        deps.send({ type: 'CONFIRM_DETAIL', epoch, text: answer.read.text, reason: answer.read.reason, crop: photo.crop });
        deps.send({ type: 'LINK_OK' });
      } catch (error) {
        failed(epoch, 'read', error);
      }
      return;
    }
    try {
      const answer = await deps.confirm(request, photo.image, photo.mime);
      state.flight -= 1;
      if (!state.active) {
        return;
      }
      const now = deps.readContext();
      if (now.epoch !== epoch || now.final) {
        return;
      }
      if (movedSince(hand, deps.handNow())) {
        deps.log('confirm answer dropped: hand moved');
        deps.send({ type: 'CONFIRM_MOVED', epoch });
        return;
      }
      deps.log(`confirm read ${answer.readMs}ms verdict ${answer.read.verdict} label ${answer.read.label_name}`);
      deps.send(verdictEvent(epoch, photo, answer.read));
      deps.send({ type: 'LINK_OK' });
    } catch (error) {
      failed(epoch, 'read', error);
    }
  }

  return {
    begin(): void {
      Object.assign(state, freshConfirmState(), { active: true, lastShotAt: deps.now() - SHOT_GAP_MS });
      this.tick();
    },

    stop(): void {
      state.active = false;
    },

    tick(): void {
      if (!state.active) {
        return;
      }
      const ctx = deps.readContext();
      if (ctx.final) {
        return;
      }
      if (ctx.epoch !== state.epoch) {
        state.epoch = ctx.epoch;
        state.tries = 0;
        state.gaveUp = false;
      }
      const maxTries = ctx.detailKind ? 1 : MAX_TRIES;
      if (state.tries >= maxTries) {
        if (state.flight === 0 && !state.gaveUp && !ctx.detailKind) {
          state.gaveUp = true;
          deps.log('confirm rereads exhausted, giving up');
          deps.send({ type: 'CONFIRM_GIVEUP' });
        }
        return;
      }
      if (state.flight >= MAX_FLIGHT) {
        return;
      }
      if (deps.now() - state.lastShotAt < SHOT_GAP_MS) {
        return;
      }
      void shoot(ctx);
    },
  };
}
