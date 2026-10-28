// Conversation actors: speaking, understanding, the sound tour and
// the working tick. Small shared actions live here too; the routing
// table and the states own the rest.
import {
  assign as rawAssign,
  enqueueActions as rawEnqueue,
  fromCallback,
  fromPromise,
  raise as rawRaise,
  sendTo as rawSendTo,
} from 'xstate';
import type { AnyActorRef } from 'xstate';
import { loadPrefs, savePrefs, saveSnapshot } from '../store';
import { playSound, say, setSpeechRate, stopVoice } from '../speech';
import { tourMeaning } from '../lines';
import { stamp } from '../stamp';
import { speech } from '../theme';
import type { Language } from '../theme';
import { understandUtterance } from '../relay';
import type { UnderstandAnswer } from '../relay';
import type { ConversationContext, ConversationEvent, ExpressionEvent, SpeakInput, TourInput, UnderstandInput } from './types';

export const assignConversation = rawAssign<ConversationContext, ExpressionEvent, undefined, ConversationEvent, never>;

export const raiseConversation = rawRaise<ConversationContext, ExpressionEvent, ConversationEvent, undefined>;

export const sendToConversation = rawSendTo<ConversationContext, ExpressionEvent, undefined, AnyActorRef, ConversationEvent>;

export const enqueueConversation = rawEnqueue<
  ConversationContext,
  ExpressionEvent,
  undefined,
  ConversationEvent,
  never,
  never,
  never,
  never,
  never
>;

export const speakMany = fromPromise<void, SpeakInput>(async ({ input }) => {
  for (const line of input.lines) {
    if (__DEV__) console.log(`[ittro] ${stamp()} say: ${JSON.stringify(line.text)}`);
    await say(line.text, input.lang);
  }
});

const understandCache = new Map<string, UnderstandAnswer>();

function fullCacheKey(input: UnderstandInput): string {
  return `full:${JSON.stringify(input)}`;
}

function shortCacheKey(input: UnderstandInput): string {
  return `short:${JSON.stringify([input.transcript, input.lang, input.step, input.pendingQuestion])}`;
}

function cacheableWithoutContext(answer: UnderstandAnswer): boolean {
  return answer.product_text === null && answer.items === null && answer.detail === null;
}

function cacheStore(key: string, value: UnderstandAnswer): void {
  understandCache.delete(key);
  understandCache.set(key, value);
  if (understandCache.size > 100) {
    const oldest = understandCache.keys().next().value;
    if (oldest !== undefined) {
      understandCache.delete(oldest);
    }
  }
}

export const understandAnswer = fromPromise(async ({ input }: { input: UnderstandInput }) => {
  const cached = understandCache.get(fullCacheKey(input)) ?? understandCache.get(shortCacheKey(input));
  if (cached) {
    if (__DEV__) console.log(`[ittro] ${stamp()} understand cached: ${JSON.stringify(input.transcript)}`);
    return cached;
  }
  if (__DEV__) console.log(`[ittro] ${stamp()} understand sent: ${JSON.stringify(input.transcript)}`);
  const answer = await understandUtterance({
    transcript: input.transcript,
    language: input.lang,
    step: input.step,
    pending_question: input.pendingQuestion,
    pending_request: input.pendingRequest,
    last_line: input.lastLine,
    effort: 'minimal',
  });
  if (__DEV__) console.log(`[ittro] ${stamp()} intent: ${JSON.stringify(answer)}`);
  cacheStore(fullCacheKey(input), answer);
  if (cacheableWithoutContext(answer)) {
    cacheStore(shortCacheKey(input), answer);
  }
  return answer;
});

export const tourSequence = fromPromise<void, TourInput>(async ({ input }) => {
  const sounds = ['heard', 'listening', 'workingTick', 'lost', 'yes', 'no'] as const;
  for (let row = 0; row < sounds.length; row += 1) {
    playSound(sounds[row]);
    await say(tourMeaning[row][input.lang], input.lang);
  }
});

export const ticking = fromCallback<{ type: 'TICK' }, { everyMs: number }>(({ input }) => {
  const timer = setInterval(() => playSound('workingTick'), input.everyMs);
  return () => clearInterval(timer);
});

export function requestKeywords(request: string | null): string[] {
  if (!request) {
    return [];
  }
  const words = request
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3)
    .filter((word, at, all) => all.indexOf(word) === at);
  return words.slice(0, 12);
}

export function applyRate(rate: number): void {
  setSpeechRate(rate);
  void loadPrefs().then((prefs) => savePrefs({ ...prefs, rate }));
}

export function storeLanguage(lang: Language): void {
  void loadPrefs().then((prefs) => savePrefs({ ...prefs, language: lang }));
}

export function storeBrief(brief: boolean): void {
  void loadPrefs().then((prefs) => savePrefs({ ...prefs, brief }));
}

export function storeFirstLaunchDone(lang: Language): void {
  void loadPrefs().then((prefs) => savePrefs({ ...prefs, language: lang, firstLaunchDone: true }));
}

export function persistSnapshot(request: string | null): void {
  void saveSnapshot({ request });
}

export function quietVoice(): void {
  stopVoice();
}

export function tickEveryMs(): number {
  return speech.workingTickEveryMs;
}
