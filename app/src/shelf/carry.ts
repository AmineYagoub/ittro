// Carrying the shelf over to the next request: the last pass's tracks
// and label crops are read for the new request at once, with no new
// photo and no SAM, when the camera has barely moved since (measured
// natively on every frame). t13 found the Guedila 8.3 s after the
// request, 3.6 s of it a new photo and SAM for a shelf outlined
// seconds before. The next regular pass checks the carried outlines.
// The last product's own outlines are left behind, since the new
// request names another: t30 re-read its one Guedila outline for 2.9 s
// before the Masaad search began. The loop's own boxes move by the
// camera's motion since, and each outline keeps the still it was cut
// from and where the camera pointed for it, so the camera draws a
// carried outline from that still like any other: in t39 a carried
// Masaad without them was drawn on an empty wall for 24 s after the
// phone turned away, and beside the bottles for 19 s more.
import { biggestFirst } from './shelfTracks';
import { moveOutlines } from './outlines';
import { packageKind } from './match';
import { readCrops, reportVerdicts } from './loopReads';
import { noteSeen, readName } from './inventory';
import type { ReadsContext } from './loopReads';
import type { CameraPan, LoopState, ShelfCarry } from './loopTypes';
import type { ShelfCrop, ShelfOutline } from '../relay';

export const CARRY_MS = 30000;

// How far the camera may have moved, as a share of the frame. The crops
// still show the same bottles after a move, and the flow measures it
// exactly (t14: -0.103 against the screenshots), so carried outlines
// shift by it and the next SAM pass corrects what is left.
export const CARRY_MOVE = 0.25;

export function takeCarry(state: LoopState, pan: CameraPan | null, now: number): ShelfCarry | null {
  if (!pan || state.request === '' || state.outlinedAt === null || state.sceneChanged) {
    return null;
  }
  const tracks = state.tracks.filter((entry) => state.crops.has(entry.track));
  if (tracks.length === 0) {
    return null;
  }
  return {
    request: state.request,
    tracks,
    crops: tracks.map((entry) => [entry.track, state.crops.get(entry.track) as string]),
    phrase: state.phrases.get(state.request) ?? null,
    at: now,
    pan,
  };
}

export function seedCarry(ctx: ReadsContext, carry: ShelfCarry, pan: CameraPan | null): boolean {
  const { deps, state } = ctx;
  if (!pan || carry.request === state.request || deps.now() - carry.at > CARRY_MS || pan.session !== carry.pan.session) {
    return false;
  }
  const dx = pan.x - carry.pan.x;
  const dy = pan.y - carry.pan.y;
  if (Math.abs(dx) > CARRY_MOVE || Math.abs(dy) > CARRY_MOVE) {
    deps.log(`shelf carry dropped, camera moved ${dx.toFixed(3)},${dy.toFixed(3)}`);
    return false;
  }
  const others = carry.tracks.filter((entry) => entry.read?.verdict !== 'yes');
  if (others.length === 0) {
    deps.log(`shelf carry skipped, its ${carry.tracks.length} outlines were the last product`);
    return false;
  }
  state.tracks = others.map((entry) => {
    const [moved] = moveOutlines([entry.outline], { dx: dx * entry.outline.box.w, dy: dy * entry.outline.box.h, scale: 1 });
    return { ...entry, outline: moved as ShelfOutline, read: null };
  });
  state.crops = new Map(carry.crops);
  state.carried = { phrase: carry.phrase };
  deps.log(`shelf carried ${state.tracks.length} outlines from the last request, camera moved ${dx.toFixed(3)},${dy.toFixed(3)}`);
  return true;
}

function cropOf(track: string, url: string | undefined): ShelfCrop | null {
  const parts = url ? /^data:([^;]+);base64,(.+)$/.exec(url) : null;
  return parts ? { id: `shelf-${track}`, mime: parts[1] as string, image: parts[2] as string } : null;
}

export async function runCarried(ctx: ReadsContext): Promise<boolean> {
  const { deps, state } = ctx;
  const carried = state.carried;
  if (!carried || state.cloudBusy || state.request === '') {
    return false;
  }
  state.carried = null;
  const crops = biggestFirst(state.tracks)
    .map((entry) => cropOf(entry.track, state.crops.get(entry.track)))
    .filter((crop): crop is ShelfCrop => crop !== null);
  if (crops.length === 0) {
    return false;
  }
  state.cloudBusy = true;
  const epoch = state.epoch;
  const request = state.request;
  try {
    const outlines = state.tracks.map((entry) => entry.outline);
    deps.send({ type: 'SHELF_OUTLINED', outlines, kind: packageKind(carried.phrase ?? request, deps.readContext().lang) });
    const answer = await readCrops(deps, request, crops);
    if (ctx.stale(epoch)) {
      return true;
    }
    state.stats.readCalls += answer.calls;
    state.stats.readCrops += crops.length;
    state.readAt = deps.now();
    deps.log(`shelf read carried ${answer.readMs}ms verdicts ${answer.reads.map((read) => read.verdict).join(',')}`);
    state.tracks = state.tracks.map((entry) => ({ ...entry, read: answer.reads.find((read) => read.id === `shelf-${entry.track}`) ?? null }));
    const pan = deps.pan?.() ?? null;
    for (const entry of state.tracks) {
      const name = entry.read ? readName(entry.read) : null;
      if (name) {
        noteSeen(name, entry.outline.box, pan, deps.now());
      }
    }
    reportVerdicts(ctx, request, answer.reads, epoch);
    return true;
  } finally {
    state.cloudBusy = false;
  }
}
