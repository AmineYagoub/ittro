// The read queue: one queue, in this order. A product in the hand
// jumps ahead of every shelf read; shelf reads keep their order.
// Each job carries the search epoch, so a late answer for a dropped
// search is discarded instead of spoken.
export interface ReadJob {
  id: string;
  image: string;
  mime: string;
  hand: boolean;
  epoch: number;
}

export interface ReadQueue {
  jobs: ReadJob[];
}

export function createReadQueue(): ReadQueue {
  return { jobs: [] };
}

export function queueSize(queue: ReadQueue): number {
  return queue.jobs.length;
}

export function enqueueRead(queue: ReadQueue, job: ReadJob): void {
  if (job.hand) {
    const firstShelf = queue.jobs.findIndex((queued) => !queued.hand);
    if (firstShelf < 0) {
      queue.jobs.push(job);
    } else {
      queue.jobs.splice(firstShelf, 0, job);
    }
    return;
  }
  queue.jobs.push(job);
}

export function nextRead(queue: ReadQueue): ReadJob | null {
  return queue.jobs.shift() ?? null;
}

export function dropEpoch(queue: ReadQueue, epoch: number): void {
  queue.jobs = queue.jobs.filter((job) => job.epoch === epoch);
}
