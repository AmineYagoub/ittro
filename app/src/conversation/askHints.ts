// What a question carries: whether the sentence sounds like a question
// (so the understanding call may send the still and answer at once),
// the last four exchanges with only what was heard of each answer,
// the products read on this shelf, and whether the shopper sounds
// upset (a repeated question, or "no, no").
import type { ConversationContext, UnderstandInput } from './types';
import type { AskExchange, AskHints, ViewTurn } from './askTypes';
import { seenNames } from '../shelf/inventory';

const HISTORY_MAX = 4;
const INVENTORY_AGE_MS = 120000;
const INVENTORY_MAX = 12;

const QUESTION_WORDS = new Set([
  'شنو', 'شنوة', 'واش', 'اش', 'وشنو', 'ماذا', 'هل', 'كم', 'بكم', 'أي', 'اي', 'أيهم', 'ايهم', 'أيها', 'ايها', 'شكون',
  'كاين', 'كاينة', 'كاينين', 'يوجد', 'توجد', 'موجود', 'سعر', 'ثمن', 'أرخص', 'ارخص', 'أغلى', 'اغلى', 'شحال', 'قداه', 'قداش',
  'quoi', 'quel', 'quelle', 'quels', 'quelles', 'lequel', 'laquelle', 'combien', 'prix', 'cher',
  'what', "what's", 'which', 'how', 'price', 'cost', 'cheaper', 'cheapest', 'there',
]);

const DOUBLED_NO = /(^|\s)(لا\s+لا|no\s+no|non\s+non)(\s|$)/u;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}'’]+/u)
    .map((word) => word.replace(/^(و|ف)(?=شنو|اش)/u, ''))
    .filter((word) => word.length > 0);
}

function normalized(text: string): string {
  return words(text).join(' ');
}

/** Whether the sentence sounds like a question about what is in view. */
export function looksLikeQuestion(text: string): boolean {
  return /[?؟]/u.test(text) || words(text).some((word) => QUESTION_WORDS.has(word) || /^qu['’]/u.test(word));
}

function firstSentence(text: string): string {
  const match = /^[^.!?؟。]*[.!?؟。]?/u.exec(text.trim());
  return (match?.[0] ?? text).trim();
}

/** The exchanges a follow-up resolves against: an interrupted answer keeps its first sentence. */
export function askHistory(turns: ViewTurn[]): AskExchange[] {
  return turns.slice(-HISTORY_MAX).map((turn) => ({ shopper: turn.shopper, ittro: turn.heard ? turn.ittro : firstSentence(turn.ittro) }));
}

/** Upset: the question repeats the last one, or the shopper said "no, no". */
export function soundsUpset(transcript: string, turns: ViewTurn[]): boolean {
  const said = normalized(transcript);
  const last = turns[turns.length - 1];
  return DOUBLED_NO.test(said) || (last !== undefined && said.length > 0 && normalized(last.shopper) === said);
}

export function askHints(context: ConversationContext, transcript: string, now: number): AskHints {
  return {
    history: askHistory(context.viewHistory),
    inventory: seenNames(now, INVENTORY_AGE_MS, INVENTORY_MAX),
    upset: soundsUpset(transcript, context.viewHistory),
    brief: context.viewBrief,
  };
}

/** The understanding call's input; a question also carries the hints and asks for the still. */
export function understandInput(context: ConversationContext, transcript: string): UnderstandInput {
  const base = {
    transcript,
    lang: context.lang,
    step: context.step,
    pendingQuestion: context.pendingQuestion,
    pendingRequest: context.pendingRequest ?? context.request,
    lastLine: context.lastLine,
  };
  if (!looksLikeQuestion(transcript)) {
    return base;
  }
  return { ...base, ask: { ...askHints(context, transcript, Date.now()), withStill: true } };
}
