// The helper store on the relay: pairing codes, questions with
// photos, and answers back to the phone. In-memory with expiry,
// enough for one shopper and the demo; a deployed relay with real
// shoppers needs a KV or Durable Object store instead.
import type { PushSubscription } from './push.ts';

export const PAIR_TTL_MS = 600000;

export const PHOTO_TTL_MS = 1800000;

export const MAX_IMAGE_CHARS = 2000000;

export const MAX_NOTE_CHARS = 200;

const MAX_NAME_CHARS = 40;

export type HelperVerdict = 'yes' | 'no' | 'cant_tell';

interface Pairing {
  name: string;
  code: string;
  createdAt: number;
  joinedToken: string | null;
}

interface Helper {
  name: string;
  token: string;
  push: PushSubscription | null;
  createdAt: number;
}

interface Answer {
  verdict: HelperVerdict;
  note: string | null;
  helper: string;
}

interface Question {
  id: string;
  tokens: string[];
  names: string[];
  question: string;
  request: string;
  read: string;
  image: string | null;
  mime: string;
  createdAt: number;
  status: 'waiting' | 'answered' | 'cancelled';
  answer: Answer | null;
}

const pairings = new Map<string, Pairing>();

const helpers = new Map<string, Helper>();

const questions = new Map<string, Question>();

let nowImpl: () => number = () => Date.now();

let randomImpl: (bytes: number) => string = (bytes) => {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
};

export function setHelperClock(next: () => number): void {
  nowImpl = next;
}

export function setHelperRandom(next: (bytes: number) => string): void {
  randomImpl = next;
}

export function resetHelpers(): void {
  pairings.clear();
  helpers.clear();
  questions.clear();
  nowImpl = () => Date.now();
}

function purge(): void {
  const now = nowImpl();
  for (const [code, pairing] of pairings) {
    if (now - pairing.createdAt >= PAIR_TTL_MS) {
      pairings.delete(code);
    }
  }
  for (const [id, question] of questions) {
    if (now - question.createdAt >= PHOTO_TTL_MS) {
      question.image = null;
      questions.delete(id);
    }
  }
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

export function issuePair(name: string): { code: string; expiresAt: number } {
  purge();
  let code = '';
  do {
    const digits = [...crypto.getRandomValues(new Uint8Array(6))].map((value) => String(value % 10)).join('');
    code = digits;
  } while (pairings.has(code));
  pairings.set(code, { name, code, createdAt: nowImpl(), joinedToken: null });
  return { code, expiresAt: nowImpl() + PAIR_TTL_MS };
}

export function pairState(
  code: string,
): { state: 'unknown' } | { state: 'waiting' } | { state: 'joined'; helper: string; token: string } {
  purge();
  const pairing = pairings.get(code);
  if (!pairing) {
    return { state: 'unknown' };
  }
  if (!pairing.joinedToken) {
    return { state: 'waiting' };
  }
  const helper = helpers.get(pairing.joinedToken);
  return { state: 'joined', helper: helper?.name ?? pairing.name, token: pairing.joinedToken };
}

export function joinPair(code: string, push: PushSubscription | null): { token: string; name: string } | null {
  purge();
  const pairing = pairings.get(code);
  if (!pairing || pairing.joinedToken) {
    return null;
  }
  const token = randomImpl(16);
  pairing.joinedToken = token;
  helpers.set(token, { name: pairing.name, token, push, createdAt: nowImpl() });
  return { token, name: pairing.name };
}

export function listHelpers(): Array<{ name: string; token: string }> {
  return [...helpers.values()].map((helper) => ({ name: helper.name, token: helper.token }));
}

export function storePush(token: string, push: PushSubscription): boolean {
  const helper = helpers.get(token);
  if (!helper) {
    return false;
  }
  helper.push = push;
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

export function askQuestion(args: AskArgs): { id: string; helpers: string[] } | null {
  purge();
  const targets = args.tokens.map((token) => helpers.get(token)).filter((helper) => helper !== undefined);
  if (targets.length === 0) {
    return null;
  }
  const id = randomImpl(12);
  questions.set(id, {
    id,
    tokens: targets.map((helper) => helper.token),
    names: targets.map((helper) => helper.name),
    question: args.question,
    request: args.request,
    read: args.read,
    image: args.image,
    mime: args.mime,
    createdAt: nowImpl(),
    status: 'waiting',
    answer: null,
  });
  return { id, helpers: targets.map((helper) => helper.name) };
}

export function pushTargets(id: string): PushSubscription[] {
  const question = questions.get(id);
  if (!question) {
    return [];
  }
  return question.tokens.map((token) => helpers.get(token)?.push).filter((push) => push !== null && push !== undefined);
}

export function nextQuestion(token: string): Question | null {
  purge();
  const helper = helpers.get(token);
  if (!helper) {
    return null;
  }
  for (const question of questions.values()) {
    if (question.status === 'waiting' && question.tokens.includes(token)) {
      return question;
    }
  }
  return null;
}

export function answerQuestion(token: string, id: string, verdict: HelperVerdict, note: string | null): boolean {
  purge();
  const helper = helpers.get(token);
  const question = questions.get(id);
  if (!helper || !question || question.status !== 'waiting' || !question.tokens.includes(token)) {
    return false;
  }
  question.status = 'answered';
  question.answer = { verdict, note, helper: helper.name };
  question.image = null;
  return true;
}

export function questionStatus(id: string): Question | null {
  purge();
  return questions.get(id) ?? null;
}

export function cancelQuestion(id: string): boolean {
  purge();
  const question = questions.get(id);
  if (!question || question.status !== 'waiting') {
    return false;
  }
  question.status = 'cancelled';
  question.image = null;
  return true;
}

