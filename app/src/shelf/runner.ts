// One shelf pass: the sharpest frame is outlined, the outlines are
// cut into crops, and the crops are read, the hand first. Every step
// is timed into the log; the camera, the crops and the relay calls are
// injected, so the phone, the Mac proof and the tests share this file.
import type { ShelfCrop, ShelfOutline, ShelfRead } from '../relay';
import { pickSharpest, sharpness } from './tracker';
import type { GreyFrame } from './tracker';
import { createReadQueue, dropEpoch, enqueueRead, nextRead } from './queue';
import type { ReadJob } from './queue';

export interface PassFrame {
  image: string;
  mime: string;
  grey: GreyFrame;
}

export interface PassTimings {
  samMs: number;
  readMs: number;
  sharpness: number;
}

export interface ShelfPass {
  outlines: ShelfOutline[];
  handRead: ShelfRead | null;
  shelfReads: ShelfRead[];
  timings: PassTimings;
  phrase: string;
}

export interface PassDeps {
  outline: (image: string, mime: string, phrase: string) => Promise<{ outlines: ShelfOutline[]; samMs: number }>;
  fetchPhrase: (request: string, image: string, mime: string) => Promise<string>;
  read: (request: string, crops: ShelfCrop[]) => Promise<{ reads: ShelfRead[]; readMs: number }>;
  cutCrops: (image: string, outlines: ShelfOutline[]) => Promise<ShelfCrop[]>;
  log: (line: string) => void;
}

export interface PassInput {
  request: string;
  frames: PassFrame[];
  hand: ShelfCrop | null;
  epoch: number;
  phrases: Map<string, string>;
}

function readOf(job: ReadJob, reads: ShelfRead[]): ShelfRead | null {
  return reads.find((read) => read.id === job.id) ?? null;
}

export async function runShelfPass(deps: PassDeps, input: PassInput): Promise<ShelfPass> {
  if (input.frames.length === 0) {
    throw new Error('a shelf pass needs at least one frame');
  }
  const sharpest = input.frames[pickSharpest(input.frames.map((frame) => frame.grey))] as PassFrame;
  const picked = sharpness(sharpest.grey);
  let phrase = input.phrases.get(input.request);
  if (!phrase) {
    phrase = await deps.fetchPhrase(input.request, sharpest.image, sharpest.mime);
    input.phrases.set(input.request, phrase);
  }
  let outlined = await deps.outline(sharpest.image, sharpest.mime, phrase);
  if (outlined.outlines.length === 0 && phrase.includes(' ')) {
    const shorter = phrase.trim().split(/\s+/).pop() as string;
    outlined = await deps.outline(sharpest.image, sharpest.mime, shorter);
    deps.log(`shelf sam retry ${shorter} ${outlined.samMs}ms outlines ${outlined.outlines.length}`);
  }
  deps.log(`shelf sam ${outlined.samMs}ms outlines ${outlined.outlines.length} sharpness ${Math.round(picked)}`);
  const queue = createReadQueue();
  if (input.hand) {
    enqueueRead(queue, { ...input.hand, hand: true, epoch: input.epoch });
  }
  for (const crop of await deps.cutCrops(sharpest.image, outlined.outlines)) {
    enqueueRead(queue, { ...crop, hand: false, epoch: input.epoch });
  }
  dropEpoch(queue, input.epoch);
  let handRead: ShelfRead | null = null;
  const jobs: ReadJob[] = [];
  let job = nextRead(queue);
  while (job) {
    jobs.push(job);
    job = nextRead(queue);
  }
  const shelfReads: ShelfRead[] = [];
  let readMs = 0;
  const handJob = jobs.find((queued) => queued.hand);
  if (handJob) {
    const answer = await deps.read(input.request, [{ id: handJob.id, image: handJob.image, mime: handJob.mime }]);
    readMs += answer.readMs;
    handRead = readOf(handJob, answer.reads);
    deps.log(`shelf hand read ${answer.readMs}ms verdict ${handRead?.verdict ?? 'missing'}`);
  }
  const shelfJobs = jobs.filter((queued) => !queued.hand);
  if (shelfJobs.length > 0) {
    const answer = await deps.read(
      input.request,
      shelfJobs.map((queued) => ({ id: queued.id, image: queued.image, mime: queued.mime })),
    );
    readMs += answer.readMs;
    for (const queued of shelfJobs) {
      const read = readOf(queued, answer.reads);
      if (read) {
        shelfReads.push(read);
      }
    }
    deps.log(`shelf read ${answer.readMs}ms verdicts ${shelfReads.map((read) => read.verdict).join(',')}`);
  }
  return { outlines: outlined.outlines, handRead, shelfReads, timings: { samMs: outlined.samMs, readMs, sharpness: picked }, phrase };
}
