// t16 (video replay): eleven honey jars on one shelf; the second read
// sent nine crops and the relay, which reads one to eight, answered
// 400, so the search failed. Crops go in calls of at most eight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { READ_MAX, readCrops } from '../src/shelf/loopReads';
import type { LoopDeps } from '../src/shelf/loopTypes';
import type { ShelfCrop } from '../src/relay';

function crops(count: number): ShelfCrop[] {
  return Array.from({ length: count }, (_, at) => ({ id: `shelf-t${at}`, image: 'crop', mime: 'image/jpeg' }));
}

test('eleven crops are read in two calls of at most eight, side by side', async () => {
  const sizes: number[] = [];
  let open = 0;
  let most = 0;
  const deps = {
    read: async (_request: string, batch: ShelfCrop[]) => {
      sizes.push(batch.length);
      open += 1;
      most = Math.max(most, open);
      await Promise.resolve();
      open -= 1;
      return { reads: batch.map((crop) => ({ id: crop.id, brand_text: null, size_text: null, verdict: 'no' as const, spoken: '' })), readMs: batch.length * 10 };
    },
  } as unknown as LoopDeps;
  const answer = await readCrops(deps, 'عسل', crops(11));
  assert.deepEqual(sizes, [READ_MAX, 3]);
  assert.equal(most, 2);
  assert.equal(answer.calls, 2);
  assert.equal(answer.reads.length, 11);
  assert.equal(answer.readMs, 80);
});

test('eight crops or fewer stay one call', async () => {
  const sizes: number[] = [];
  const deps = {
    read: async (_request: string, batch: ShelfCrop[]) => {
      sizes.push(batch.length);
      return { reads: [], readMs: 5 };
    },
  } as unknown as LoopDeps;
  await readCrops(deps, 'عسل', crops(8));
  assert.deepEqual(sizes, [8]);
});
