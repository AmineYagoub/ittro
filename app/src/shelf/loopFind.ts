// The fresh-shelf find through the relay's /find: Muse Spark boxes the
// requested product and SAM cuts it in one round trip, so the found
// line no longer waits on a phrase, SAM on every package and crop
// reads. Only the requested product comes back, read yes by the name
// printed on it. When none is in view the pass goes on the old way,
// whose reads say what is there instead and start the sweep. The found
// card shows the target's label, the biggest yes, and the found line
// goes before the outlines, so they land on a known target and "I see
// two products, reading their labels" is not said for a label already
// read. The outlines keep the still's camera pan: the still is about
// 7 s old when they land (t31), and a move since is cut again
// (recut.ts).
import type { ShelfRead } from '../relay';
import { anchorOutlines } from './outlines';
import { biggestFirst, reconcileTracks } from './shelfTracks';
import { outlineSignature, packageKind } from './match';
import { reportVerdicts } from './loopReads';
import { noteSeen } from './inventory';
import type { ReadsContext } from './loopReads';
import type { LoopPhoto } from './loopTypes';

/** True when the find settled the pass; false sends it on the old path. */
export async function findPass(ctx: ReadsContext, request: string, epoch: number, photo: LoopPhoto, nextId: () => string, sharp: number): Promise<boolean> {
  const { deps, state } = ctx;
  if (!deps.find) {
    return false;
  }
  const found = await deps.find(request, photo.image, photo.mime, photo.w, photo.h);
  state.stats.findCalls += 1;
  if (ctx.stale(epoch)) {
    return true;
  }
  deps.log(
    `shelf find ground ${found.groundMs}ms sam ${found.samMs}ms masks ${found.maskMs}ms outlines ${found.outlines.length} ${found.outlines.map((outline) => outline.label).join(' | ')} sharpness ${Math.round(sharp)}`,
  );
  if (found.outlines.length === 0) {
    return false;
  }
  const outlines = anchorOutlines(
    found.outlines.map((outline) => ({ id: outline.id, frame: outline.frame, box: outline.box, ...(outline.mask ? { mask: outline.mask } : {}) })),
    photo.shot,
  );
  state.outlinedAt = deps.now();
  state.outlinedPan = photo.pan ?? null;
  state.readAt = deps.now();
  state.sceneChanged = false;
  state.emptyOutlines = 0;
  state.tracks = reconcileTracks(state.tracks, outlines, nextId);
  const pan = deps.pan?.() ?? null;
  const reads: ShelfRead[] = state.tracks.map((entry) => {
    const label = found.outlines[outlines.indexOf(entry.outline)]?.label || request;
    noteSeen(label, entry.outline.box, pan, deps.now());
    entry.read = { id: `shelf-${entry.track}`, brand_text: label, size_text: null, verdict: 'yes', spoken: label };
    return entry.read;
  });
  const target = biggestFirst(state.tracks)[0];
  if (target) {
    const [cut] = await deps.cutCrops(photo.image, [{ track: target.track, outline: target.outline }]);
    if (ctx.stale(epoch)) {
      return true;
    }
    if (cut) {
      state.crops.set(target.track, `data:${cut.mime};base64,${cut.image}`);
    }
  }
  reportVerdicts(ctx, request, reads, epoch);
  const signature = outlineSignature(outlines);
  if (signature !== state.lastSignature) {
    state.lastSignature = signature;
    deps.send({ type: 'SHELF_OUTLINED', outlines, kind: packageKind(state.phrases.get(request) ?? request, deps.readContext().lang) });
  }
  return true;
}

