// The helper store on the relay: pairing codes, questions with
// photos, and answers back to the phone. On Workers it lives in the
// relay's own KV (ITTRO_HELPERS), so a pairing made in one isolate
// is there in the next; without that binding it falls back to
// memory. Pairings expire after 10 minutes, questions after 30, and
// the photo is gone on answer, cancel or expiry.
import type { PushSubscription } from './push.ts';
import { kvHelperStore, memoryHelperStore, readPairing, readQuestion, readRecord, remainingTtlS } from './helperStore.ts';
import type { HelperKv, HelperVerdict, KvBinding, StoredHelper, StoredQuestion } from './helperStore.ts';
import type { Env } from './gate.ts';

export type { HelperVerdict } from './helperStore.ts';

export const PAIR_TTL_MS = 600000;

export const PHOTO_TTL_MS = 1800000;

export const MAX_IMAGE_CHARS = 2000000;

export const MAX_NOTE_CHARS = 200;

const MAX_NAME_CHARS = 40;

let nowImpl: () => number = () => Date.now();

let randomImpl: (bytes: number) => string = (bytes) => {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
};

let memory: HelperKv = memoryHelperStore(() => nowImpl());

export function setHelperClock(next: () => number): void {
  nowImpl = next;
}

export function setHelperRandom(next: (bytes: number) => string): void {
  randomImpl = next;
}

export function resetHelpers(): void {
  memory = memoryHelperStore(() => nowImpl());
  nowImpl = () => Date.now();
}

export function helperKv(env: Env): HelperKv {
  const binding = env.ITTRO_HELPERS as KvBinding | undefined;
  return binding ? kvHelperStore(binding) : memory;
}

export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= MAX_NAME_CHARS ? name : null;
}

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function freshCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(6))].map((value) => String(value % 10)).join('');
}

export async function issuePair(kv: HelperKv, name: string): Promise<{ code: string; expiresAt: number }> {
  let code = freshCode();
  while (await readPairing(kv, code, nowImpl(), PAIR_TTL_MS)) {
    code = freshCode();
  }
  const createdAt = nowImpl();
  await kv.put(`pair:${code}`, JSON.stringify({ name, code, createdAt, joinedToken: null }), PAIR_TTL_MS / 1000);
  return { code, expiresAt: createdAt + PAIR_TTL_MS };
}

export async function pairState(
  kv: HelperKv,
  code: string,
): Promise<{ state: 'unknown' } | { state: 'waiting' } | { state: 'joined'; helper: string; token: string }> {
  const pairing = await readPairing(kv, code, nowImpl(), PAIR_TTL_MS);
  if (!pairing) {
    return { state: 'unknown' };
  }
  if (!pairing.joinedToken) {
    return { state: 'waiting' };
  }
  const helper = await readRecord<StoredHelper>(kv, `helper:${pairing.joinedToken}`);
  return { state: 'joined', helper: helper?.name ?? pairing.name, token: pairing.joinedToken };
}

export async function joinPair(
  kv: HelperKv,
  code: string,
  push: PushSubscription | null,
): Promise<{ token: string; name: string } | null> {
  const pairing = await readPairing(kv, code, nowImpl(), PAIR_TTL_MS);
  if (!pairing || pairing.joinedToken) {
    return null;
  }
  const token = randomImpl(16);
  pairing.joinedToken = token;
  await kv.put(`pair:${code}`, JSON.stringify(pairing), remainingTtlS(nowImpl(), pairing.createdAt, PAIR_TTL_MS));
  await kv.put(`helper:${token}`, JSON.stringify({ name: pairing.name, token, push, createdAt: nowImpl() }));
  return { token, name: pairing.name };
}

export async function listHelpers(kv: HelperKv): Promise<Array<{ name: string; token: string }>> {
  const names = await kv.list('helper:');
  const helpers: Array<{ name: string; token: string }> = [];
  for (const key of names) {
    const helper = await readRecord<StoredHelper>(kv, key);
    if (helper) {
      helpers.push({ name: helper.name, token: helper.token });
    }
  }
  return helpers;
}

export async function storePush(kv: HelperKv, token: string, push: PushSubscription): Promise<boolean> {
  const helper = await readRecord<StoredHelper>(kv, `helper:${token}`);
  if (!helper) {
    return false;
  }
  helper.push = push;
  await kv.put(`helper:${token}`, JSON.stringify(helper));
  return true;
}

export interface AskArgs {
  tokens: string[];
  question: string;
  request: string;
  read: string;
  image: string;
  mime: string;
}

export async function askQuestion(kv: HelperKv, args: AskArgs): Promise<{ id: string; helpers: string[] } | null> {
  const targets: StoredHelper[] = [];
  for (const token of args.tokens) {
    const helper = await readRecord<StoredHelper>(kv, `helper:${token}`);
    if (helper) {
      targets.push(helper);
    }
  }
  if (targets.length === 0) {
    return null;
  }
  const id = randomImpl(12);
  const createdAt = nowImpl();
  await kv.put(
    `question:${id}`,
    JSON.stringify({
      id,
      tokens: targets.map((helper) => helper.token),
      names: targets.map((helper) => helper.name),
      question: args.question,
      request: args.request,
      read: args.read,
      image: args.image,
      mime: args.mime,
      createdAt,
      status: 'waiting',
      answer: null,
    }),
    PHOTO_TTL_MS / 1000,
  );
  return { id, helpers: targets.map((helper) => helper.name) };
}

export async function pushTargets(kv: HelperKv, id: string): Promise<PushSubscription[]> {
  const question = await readQuestion(kv, id, nowImpl(), PHOTO_TTL_MS);
  if (!question) {
    return [];
  }
  const pushes: PushSubscription[] = [];
  for (const token of question.tokens) {
    const helper = await readRecord<StoredHelper>(kv, `helper:${token}`);
    if (helper?.push) {
      pushes.push(helper.push);
    }
  }
  return pushes;
}

export async function nextQuestion(kv: HelperKv, token: string): Promise<StoredQuestion | null> {
  const helper = await readRecord<StoredHelper>(kv, `helper:${token}`);
  if (!helper) {
    return null;
  }
  const names = await kv.list('question:');
  const waiting: StoredQuestion[] = [];
  for (const key of names) {
    const question = await readQuestion(kv, key.replace(/^question:/, ''), nowImpl(), PHOTO_TTL_MS);
    if (question && question.status === 'waiting' && question.tokens.includes(token)) {
      waiting.push(question);
    }
  }
  waiting.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  return waiting[0] ?? null;
}

async function settleQuestion(
  kv: HelperKv,
  question: StoredQuestion,
  status: 'answered' | 'cancelled',
  answer: StoredQuestion['answer'],
): Promise<void> {
  question.status = status;
  question.answer = answer;
  question.image = null;
  await kv.put(`question:${question.id}`, JSON.stringify(question), remainingTtlS(nowImpl(), question.createdAt, PHOTO_TTL_MS));
}

export async function answerQuestion(
  kv: HelperKv,
  token: string,
  id: string,
  verdict: HelperVerdict,
  note: string | null,
): Promise<boolean> {
  const helper = await readRecord<StoredHelper>(kv, `helper:${token}`);
  const question = await readQuestion(kv, id, nowImpl(), PHOTO_TTL_MS);
  if (!helper || !question || question.status !== 'waiting' || !question.tokens.includes(token)) {
    return false;
  }
  await settleQuestion(kv, question, 'answered', { verdict, note, helper: helper.name });
  return true;
}

export async function questionStatus(kv: HelperKv, id: string): Promise<StoredQuestion | null> {
  return readQuestion(kv, id, nowImpl(), PHOTO_TTL_MS);
}

export async function cancelQuestion(kv: HelperKv, id: string): Promise<boolean> {
  const question = await readQuestion(kv, id, nowImpl(), PHOTO_TTL_MS);
  if (!question || question.status !== 'waiting') {
    return false;
  }
  await settleQuestion(kv, question, 'cancelled', null);
  return true;
}
