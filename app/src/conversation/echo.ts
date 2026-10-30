// Telling Ittro's own voice from the shopper's: the mic stays live
// while Ittro speaks, so every transcript is checked against what
// Ittro just said. A transcript that repeats it is dropped silently;
// one that carries it plus more has the echo stripped and the rest
// understood; anything else is the shopper's.
import { partsText } from '../guide/lines';
import type { ConversationContext, ExpressionEvent } from './types';

const COVERAGE = 0.5;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’‘"“”«»()\-:;,]/g, '')
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

export function ownSpeech(context: ConversationContext): string[] {
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

export type TranscriptFate = { echo: true } | { echo: false; text: string; stripped: boolean };

export function transcriptFate(transcript: string, own: string[]): TranscriptFate {
  const ownSentences = new Set<string>();
  const ownLines: string[] = [];
  for (const line of own) {
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
  return { echo: false, text: remainder, stripped: kept.length < sentences.length };
}

function eventText(event: ExpressionEvent): string | null {
  return event.type === 'FINAL_TEXT' || event.type === 'PARTIAL_TEXT' ? event.text : null;
}

interface EchoArgs {
  context: ConversationContext;
  event: ExpressionEvent;
}

export const echoFull = ({ context, event }: EchoArgs): boolean => {
  const text = eventText(event);
  if (text === null) {
    return false;
  }
  return transcriptFate(text, ownSpeech(context)).echo === true;
};

export const echoStripped = ({ context, event }: EchoArgs): boolean => {
  const text = eventText(event);
  if (text === null) {
    return false;
  }
  const fate = transcriptFate(text, ownSpeech(context));
  return fate.echo === false && fate.stripped;
};

export function strippedText({ context, event }: EchoArgs): string {
  const text = eventText(event) ?? '';
  const fate = transcriptFate(text, ownSpeech(context));
  return fate.echo === false ? fate.text : text;
}
