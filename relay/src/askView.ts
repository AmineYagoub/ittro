// Answers a shopper's question about what the camera sees, from the
// same still the shelf read sends (decision record 0001). Muse Spark
// writes the answer to a voice style, says only what it can read, and
// names one product the app may offer to take the shopper to. The
// not-here summary asks the same way, with the product that was not
// found in place of a question.
import { callSparkJson } from './spark.ts';
import type { SparkSchema } from './spark.ts';
import { askFields, mimeField, textField } from './bodies.ts';
import { recordSparkCost } from './gate.ts';
import type { Env } from './gate.ts';

export interface AskExchange {
  shopper: string;
  ittro: string;
}

export interface AskHints {
  language: 'en' | 'ar' | 'fr';
  history: AskExchange[];
  inventory: string[];
  upset: boolean;
  brief: boolean;
}

export interface AskViewArgs extends AskHints {
  question: string | null;
  wanted: string | null;
  image: string;
  mime: string;
}

export interface ViewAnswer {
  answer: string;
  offer: string | null;
  unreadable: string[];
}

export interface AskViewResult {
  view: ViewAnswer;
  askMs: number;
}

const ANSWER_MAX = 400;
const OFFER_MAX = 100;

export const VIEW_PROPERTIES = {
  answer: { type: 'string' },
  offer: { type: ['string', 'null'] },
  unreadable: { type: 'array', items: { type: 'string' } },
};

const VIEW_SCHEMA: SparkSchema = {
  name: 'answer_about_view',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: VIEW_PROPERTIES,
    required: ['answer', 'offer', 'unreadable'],
  },
  strict: true,
};

/** The voice and honesty rules for every answer about the view; the understanding call reuses them. */
export const VIEW_RULES = [
  "You answer a blind shopper's question about what their phone camera sees on a shop shelf in Algeria.",
  'Say only what you can read in this photo: product names as their labels print them, prices, counts you can see. Never',
  'guess. Anything asked about that you cannot read goes in unreadable, and the answer says you cannot read it.',
  'Match by meaning across languages and scripts: a label in French or Arabic answers a question in Darija (عسلة is honey,',
  'Haricot blanc is white beans, Riz blanc is white rice). Answer the question first (yes or no when asked whether',
  'something is here), then where it is in view: the top or bottom shelf, left, middle or right.',
  'Prices only when the question asks about price or cheaper. A shelf tag directly under one product is that product\'s',
  'price; a tag between two products, or one you cannot place, is unreadable for both: say you cannot tell whose it is.',
  'A reflection in glass or a mirror, or a picture of a product, is never a product.',
  'Speak from what the camera covers: "on this shelf" ("على هذا الرف", "sur ce rayon"), never about the whole shop. When the',
  'question names something not in view, say it is not on this shelf.',
  'Never judge health, allergens, ingredients or medicines; for a medicine, say you cannot help with it.',
  'Voice style: one or two short sentences for speech, never three, no lists with numbers or bullets, everyday words, in',
  'the language of the question and its dialect (Algerian Darija in, light Algerian Darija out), numbers and prices said',
  'the way people say them. In Arabic, write every name in Arabic script: translate the kind and transliterate the brand',
  '(Bifa → بيفا, Haricot blanc → فاصوليا بيضاء).',
  'offer is null unless the question asks for a product, a choice between products, or whether something is here; then it',
  'is the one product the answer points to, as its name only (kind and brand, no verb), in the language of the question.',
  'Never ask whether to take them there; the app asks.',
  'history holds the last exchanges, oldest first, to resolve "the other one" or "that one". inventory lists products',
  'already read on this shelf: it helps with names, but the photo decides what is there.',
  'When upset is true the shopper repeated themselves or said no: answer shorter and calmer, and offer help.',
  'When brief is true answer in one short sentence.',
].join(' ');

const NOT_HERE_RULES = [
  'Here the shopper wants the product in wanted, and Ittro looked across the shelf without finding it. Say in one short',
  'sentence that you do not see it on this shelf, then name at most three products you can read in view. offer the one',
  'closest to what they wanted, by its name only, when it is the same kind of product (another rice for a rice);',
  'otherwise offer is null.',
].join(' ');

export function isViewAnswer(value: unknown): value is ViewAnswer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['answer'] === 'string' &&
    v['answer'].trim().length > 0 &&
    v['answer'].length <= ANSWER_MAX &&
    (v['offer'] === null || (typeof v['offer'] === 'string' && v['offer'].trim().length > 0 && v['offer'].length <= OFFER_MAX)) &&
    Array.isArray(v['unreadable']) &&
    v['unreadable'].every((item) => typeof item === 'string')
  );
}

export async function askView(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  args: AskViewArgs,
): Promise<AskViewResult> {
  if (!args.question && !args.wanted) {
    throw new Error('ask-view needs a question or the product not found');
  }
  const facts = {
    question: args.question,
    wanted: args.wanted,
    language: args.language,
    history: args.history,
    inventory: args.inventory,
    upset: args.upset,
    brief: args.brief,
  };
  const input = [
    { role: 'system', content: args.wanted ? `${VIEW_RULES} ${NOT_HERE_RULES}` : VIEW_RULES },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: JSON.stringify(facts) },
        { type: 'input_image', image_url: `data:${args.mime};base64,${args.image}` },
      ],
    },
  ];
  const started = Date.now();
  const view = await callSparkJson({ fetchImpl, apiBase, apiKey, input, effort: 'minimal', schema: VIEW_SCHEMA, guard: isViewAnswer });
  return { view: { ...view, answer: view.answer.trim(), offer: view.offer?.trim() || null }, askMs: Date.now() - started };
}

export async function askViewRoute(body: unknown, env: Env): Promise<Response> {
  const record = (body ?? {}) as Record<string, unknown>;
  const image = textField(record['image']);
  const question = textField(record['question']);
  const wanted = textField(record['wanted']);
  if (!image || (!question && !wanted)) {
    return Response.json({ ok: false, error: 'missing image, or a question or the product not found' }, { status: 400 });
  }
  try {
    const result = await askView(fetch, env.META_API_BASE, env.META_API_KEY, {
      ...askFields(record),
      question,
      wanted,
      image,
      mime: mimeField(record['mime']),
    });
    await recordSparkCost(env);
    return Response.json({ ok: true, view: result.view, askMs: result.askMs });
  } catch (err) {
    return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
  }
}
