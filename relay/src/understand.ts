// Understands one shopper sentence with Muse Spark: the intent, the
// language actually spoken and anything asked for. Strict schema,
// like every Spark call; the phone decides what to do with it.
import { UNDERSTAND_SCHEMA, callSparkJson, isUnderstandAnswer } from './spark.ts';
import type { UnderstandAnswer } from './spark.ts';

export interface UnderstandContext {
  transcript: string;
  language: string;
  step: string;
  pending_question: string | null;
  pending_request: string | null;
  last_line?: string | null;
  effort?: string;
}

const INSTRUCTIONS = [
  'You are Ittro, a shopping companion for a blind shopper. Read one transcribed sentence and say what it means.',
  'Intents: request_product (something wanted, possibly several items), confirm_yes, confirm_no, where_is_it,',
  'is_this_right, read_detail, got_it, guide_me, read_again, keep_looking, find_another, start_over, done,',
  'ask_someone, add_helper, cancel, repeat, shorter, more_detail, speak_faster, speak_slower, sounds_tour,',
  'next, skip, help, speak_language, stop, wake, not_understood.',
  'Answer a yes/no question with confirm_yes or confirm_no, however politely it is phrased.',
  'A bare language name is speak_language with that target. In step sleep, calling for Ittro is wake and anything',
  'else is not_understood. last_line is the last thing the app said; use it to resolve short answers.',
  'When pending_request names something and the sentence corrects or narrows it, product_text is the full corrected',
  'request: pending_request plus the new detail. Example: pending_request "Masaad water" plus "no, the big one" gives',
  'product_text "Masaad water, the big one". A correction of pending_request is confirm_no with the full corrected',
  'product_text. A wholly new product replaces pending_request instead.',
  'product_text repeats what was asked for, word for word; never add a brand, size or detail not said.',
  'items lists each thing wanted when several are named, else null. detail names the label part for read_detail.',
  'target_language is set only for speak_language. helper_name is set only for ask_someone and add_helper.',
  'language_spoken is the language of the sentence itself: en, ar or fr.',
  'Anything else, or anything you cannot place, is not_understood.',
].join(' ');

export async function understandUtterance(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  context: UnderstandContext,
): Promise<UnderstandAnswer> {
  const input = [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content: JSON.stringify({ ...context, effort: undefined }) },
  ];
  const effort = context.effort === 'minimal' || context.effort === 'low' ? context.effort : 'low';
  return callSparkJson({ fetchImpl, apiBase, apiKey, input, effort, schema: UNDERSTAND_SCHEMA, guard: isUnderstandAnswer });
}
