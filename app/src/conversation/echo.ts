// Telling Ittro's own voice from the shopper's: every transcript is
// checked against what Ittro just said. One that repeats it is dropped
// silently; one that carries it plus more has the echo stripped and
// the rest understood; anything else is the shopper's. Arabic folds
// diacritics and hamza first, and while Ittro's voice is fresh its
// first words and near-verbatim wobbles drop too.
import { assignConversation as assign } from './actors';
import { partsText } from '../guide/lines';
import type { ConversationContext, ExpressionEvent, VoiceEcho } from './types';
import { voiceQuietMs } from '../voiceGate';

const COVERAGE = 0.5;

const OVERLAP_MIN_WORDS = 3;

const OVERLAP_COVERAGE = 0.75;

const VOICE_KEEP_MS = 10000;

const VOICE_KEEP_COUNT = 6;

export const ECHO_WINDOW_MS = 5000;

function foldArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function normalize(text: string): string {
  return foldArabic(text.toLowerCase())
    .replace(/['’‘"“”«»()\-:;,،؛]/g, '')
    .replace(/[.?!…؟]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<!\d)[.?!…؟]+(?!\d)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function words(text: string): string[] {
  return text.split(' ').filter((word) => word.length > 0);
}

function oneApart(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const long = a.length >= b.length ? a : b;
  const short = a.length >= b.length ? b : a;
  if (long.length - short.length > 1) {
    return false;
  }
  for (let at = 0, other = 0; at < long.length && other < short.length; at += 1, other += 1) {
    if (long[at] === short[other]) {
      continue;
    }
    if (long.length === short.length) {
      return long.slice(at + 1) === short.slice(other + 1);
    }
    return long.slice(at + 1) === short.slice(other);
  }
  return true;
}

export function pushVoice(log: VoiceEcho[], line: string): VoiceEcho[] {
  const now = Date.now();
  const kept = line.trim().length > 0 ? [...log, { text: line, at: now }] : [...log];
  return kept.filter((entry) => now - entry.at <= VOICE_KEEP_MS).slice(-VOICE_KEEP_COUNT);
}

export const noteVoice = assign({
  voiceAt: () => Date.now(),
  voiceLog: ({ context }: { context: ConversationContext }) => pushVoice(context.voiceLog, context.lastLine),
});

export function inEchoWindow(context: ConversationContext): boolean {
  return Date.now() - context.voiceAt <= ECHO_WINDOW_MS;
}

export function ownSpeechCurrent(context: ConversationContext): string[] {
  const lines = [context.lastLine, ...context.pendingSay.map((line) => line.text)];
  const guide = partsText(context.guideParts, context.lang);
  const confirm = partsText(context.confirmParts, context.lang);
  if (guide) {
    lines.push(guide);
  }
  if (confirm) {
    lines.push(confirm);
  }
  return lines.filter((line) => normalize(line).length > 0);
}

export function ownSpeechPast(context: ConversationContext): string[] {
  const now = Date.now();
  return context.voiceLog
    .filter((entry) => now - entry.at <= VOICE_KEEP_MS)
    .map((entry) => entry.text)
    .filter((line) => normalize(line).length > 0);
}

export type TranscriptFate = { echo: true } | { echo: false; text: string; stripped: boolean };

function freshPrefix(remainder: string[], candidates: string[]): boolean {
  if (remainder.length === 0) {
    return false;
  }
  for (const candidate of candidates) {
    const candWords = words(candidate);
    if (candWords.length === 0 || candWords[0] !== remainder[0]) {
      continue;
    }
    if (remainder.length === 1) {
      return true;
    }
    if (remainder.length === 2) {
      if (candWords.length >= 2 && (candWords[1] === remainder[1] || oneApart(candWords[1] as string, remainder[1] as string))) {
        return true;
      }
      continue;
    }
    const phrase = remainder.join(' ');
    if (candidate === phrase || candidate.startsWith(`${phrase} `)) {
      return true;
    }
  }
  return false;
}

function freshOverlap(remainder: string[], candidates: string[]): boolean {
  if (remainder.length < OVERLAP_MIN_WORDS) {
    return false;
  }
  for (const candidate of candidates) {
    const candWords = words(candidate);
    const candSet = new Set(candWords);
    const hits = remainder.filter((word) => candSet.has(word)).length;
    if (hits / remainder.length >= OVERLAP_COVERAGE && contiguousRun(remainder, candWords) >= OVERLAP_MIN_WORDS) {
      return true;
    }
  }
  return false;
}

function contiguousRun(remainder: string[], candWords: string[]): number {
  let best = 0;
  for (let start = 0; start < remainder.length; start += 1) {
    for (let at = 0; at < candWords.length; at += 1) {
      let run = 0;
      while (
        start + run < remainder.length &&
        at + run < candWords.length &&
        remainder[start + run] === candWords[at + run]
      ) {
        run += 1;
      }
      best = Math.max(best, run);
    }
  }
  return best;
}

export function transcriptFate(transcript: string, own: string[], inWindow = false, past: string[] = []): TranscriptFate {
  const ownSentences = new Set<string>();
  const ownLines: string[] = [];
  for (const line of [...own, ...past]) {
    const normLine = normalize(line);
    if (normLine) {
      ownLines.push(normLine);
    }
    for (const sentence of splitSentences(line)) {
      const norm = normalize(sentence);
      if (norm) {
        ownSentences.add(norm);
      }
    }
  }
  const freshLines: string[] = [];
  const freshSentences: string[] = [];
  for (const line of own) {
    const normLine = normalize(line);
    if (normLine) {
      freshLines.push(normLine);
    }
    for (const sentence of splitSentences(line)) {
      const norm = normalize(sentence);
      if (norm) {
        freshSentences.push(norm);
      }
    }
  }
  const sentences = splitSentences(transcript);
  const kept = sentences.filter((sentence) => !ownSentences.has(normalize(sentence)));
  if (kept.length === 0) {
    return { echo: true };
  }
  const remainder = kept.join(' ');
  const normRemainder = normalize(remainder);
  if (!normRemainder) {
    return { echo: true };
  }
  const remainderWords = new Set(words(normRemainder));
  for (const line of ownLines) {
    if (!line.includes(normRemainder)) {
      continue;
    }
    const lineWords = words(line);
    const overlap = lineWords.filter((word) => remainderWords.has(word)).length;
    if (lineWords.length > 0 && overlap / lineWords.length >= COVERAGE) {
      return { echo: true };
    }
  }
  if (words(normRemainder).length >= 3) {
    const phrase = ` ${normRemainder} `;
    for (const sentence of ownSentences) {
      if (` ${sentence} `.includes(phrase)) {
        return { echo: true };
      }
    }
  }
  if (inWindow) {
    const candidates = [...freshLines, ...freshSentences];
    const remainderList = words(normRemainder);
    if (freshPrefix(remainderList, candidates) || freshOverlap(remainderList, candidates)) {
      return { echo: true };
    }
  }
  return { echo: false, text: remainder, stripped: kept.length < sentences.length };
}

function eventText(event: ExpressionEvent): string | null {
  return event.type === 'FINAL_TEXT' || event.type === 'PARTIAL_TEXT' ? event.text : null;
}

interface EchoArgs {
  context: ConversationContext;
  event: ExpressionEvent;
}

const SHORT_ANSWERS = new Set(['yes', 'no', 'نعم', 'لا', 'oui', 'non']);

const ANSWER_QUESTIONS = new Set([
  'confirm_request',
  'language_offer',
  'tour_offer',
  'close_alternative',
  'helper_send',
  'helper_offer',
]);

function shortAnswerOpen(context: ConversationContext, text: string): boolean {
  return (
    SHORT_ANSWERS.has(normalize(text)) &&
    context.pendingQuestion !== null &&
    ANSWER_QUESTIONS.has(context.pendingQuestion)
  );
}

// The mic is gated while Ittro speaks, so an offered choice heard
// while Ittro is quiet, or anything heard once the gate has been open
// 2.5 s, is the shopper (t12, t16 dropped "ابحث عن غيره" 12 s after).
function shopperForSure(context: ConversationContext, text: string): boolean {
  const said = normalize(text);
  return !context.talkBusy && (voiceQuietMs() >= 2500 || (said.length > 0 && context.lastChips.some((chip) => normalize(chip) === said)));
}

export const echoFull = ({ context, event }: EchoArgs): boolean => {
  const text = eventText(event);
  if (text === null) {
    return false;
  }
  if (shortAnswerOpen(context, text) || shopperForSure(context, text)) {
    return false;
  }
  return transcriptFate(text, ownSpeechCurrent(context), inEchoWindow(context), ownSpeechPast(context)).echo === true;
};

export const echoStripped = ({ context, event }: EchoArgs): boolean => {
  const text = eventText(event);
  if (text === null) {
    return false;
  }
  const fate = transcriptFate(text, ownSpeechCurrent(context), inEchoWindow(context), ownSpeechPast(context));
  return fate.echo === false && fate.stripped && !shopperForSure(context, text);
};

export function strippedText({ context, event }: EchoArgs): string {
  const text = eventText(event) ?? '';
  const fate = transcriptFate(text, ownSpeechCurrent(context), inEchoWindow(context), ownSpeechPast(context));
  return fate.echo === false ? fate.text : text;
}
