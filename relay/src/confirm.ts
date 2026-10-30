// Confirms the product held in the hand, and reads one label detail
// word for word. One photo, one strict answer: yes only when every
// asked attribute is read and matches, no when anything is
// contradicted, unsure when anything asked is unreadable, picture
// when the photo itself is unusable. Details are copied exactly and
// never advised on: no medicines identified, no safety judged.
import { callSparkJson } from './spark.ts';
import type { SparkSchema } from './spark.ts';
import { mimeField, textField } from './bodies.ts';
import { recordSparkCost } from './gate.ts';
import type { Env } from './gate.ts';

export type ConfirmVerdict = 'yes' | 'no' | 'unsure' | 'picture';

export type PictureProblem = 'blurry' | 'dark' | 'glare' | 'far' | 'turned';

export type ConfirmAttr = 'brand' | 'product' | 'variant' | 'size';

export interface ConfirmAttrs {
  brand: string | null;
  product: string | null;
  variant: string | null;
  size: string | null;
}

export interface ConfirmRead {
  verdict: ConfirmVerdict;
  picture_problem: PictureProblem | null;
  asked: ConfirmAttrs;
  read: ConfirmAttrs;
  label_name: string;
  unreadable: ConfirmAttr[];
}

export interface ConfirmResult {
  read: ConfirmRead;
  readMs: number;
}

export type DetailKind = 'date' | 'size' | 'price' | 'ingredients';

export type DetailReason = 'too_small' | 'blurry' | 'dark' | 'glare' | 'turned' | 'not_visible';

export interface DetailRead {
  text: string | null;
  reason: DetailReason | null;
}

export interface DetailResult {
  read: DetailRead;
  readMs: number;
}

export interface ConfirmArgs {
  request: string;
  image: string;
  mime: string;
}

export interface DetailArgs {
  detail: DetailKind;
  image: string;
  mime: string;
}

const ATTRS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    brand: { type: ['string', 'null'] },
    product: { type: ['string', 'null'] },
    variant: { type: ['string', 'null'] },
    size: { type: ['string', 'null'] },
  },
  required: ['brand', 'product', 'variant', 'size'],
};

const CONFIRM_SCHEMA: SparkSchema = {
  name: 'confirm_in_hand',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      verdict: { type: 'string', enum: ['yes', 'no', 'unsure', 'picture'] },
      picture_problem: { type: ['string', 'null'], enum: ['blurry', 'dark', 'glare', 'far', 'turned', null] },
      asked: ATTRS_SCHEMA,
      read: ATTRS_SCHEMA,
      label_name: { type: 'string' },
      unreadable: { type: 'array', items: { type: 'string', enum: ['brand', 'product', 'variant', 'size'] } },
    },
    required: ['verdict', 'picture_problem', 'asked', 'read', 'label_name', 'unreadable'],
  },
  strict: true,
};

const DETAIL_SCHEMA: SparkSchema = {
  name: 'read_label_detail',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: ['string', 'null'] },
      reason: { type: ['string', 'null'], enum: ['too_small', 'blurry', 'dark', 'glare', 'turned', 'not_visible', null] },
    },
    required: ['text', 'reason'],
  },
  strict: true,
};

function isAttrs(value: unknown): value is ConfirmAttrs {
  if (!value || typeof value !== 'object') return false;
  const attrs = value as Record<string, unknown>;
  return (['brand', 'product', 'variant', 'size'] as const).every(
    (key) => typeof attrs[key] === 'string' || attrs[key] === null,
  );
}

function isConfirmRead(value: unknown): value is ConfirmRead {
  if (!value || typeof value !== 'object') return false;
  const read = value as Record<string, unknown>;
  const verdict = read['verdict'];
  const problem = read['picture_problem'];
  const unreadable = read['unreadable'];
  if (verdict !== 'yes' && verdict !== 'no' && verdict !== 'unsure' && verdict !== 'picture') return false;
  if (problem !== null && problem !== 'blurry' && problem !== 'dark' && problem !== 'glare' && problem !== 'far' && problem !== 'turned') {
    return false;
  }
  if (verdict === 'picture' ? problem === null : problem !== null) return false;
  if (!isAttrs(read['asked']) || !isAttrs(read['read'])) return false;
  if (typeof read['label_name'] !== 'string') return false;
  if (!Array.isArray(unreadable)) return false;
  if (!unreadable.every((attr) => attr === 'brand' || attr === 'product' || attr === 'variant' || attr === 'size')) {
    return false;
  }
  if (verdict === 'yes' && unreadable.length > 0) return false;
  return true;
}

function isDetailRead(value: unknown): value is DetailRead {
  if (!value || typeof value !== 'object') return false;
  const read = value as Record<string, unknown>;
  const text = read['text'];
  const reason = read['reason'];
  if (text !== null && (typeof text !== 'string' || text.trim().length === 0)) return false;
  if (
    reason !== null &&
    reason !== 'too_small' &&
    reason !== 'blurry' &&
    reason !== 'dark' &&
    reason !== 'glare' &&
    reason !== 'turned' &&
    reason !== 'not_visible'
  ) {
    return false;
  }
  if (text === null ? reason === null : reason !== null) return false;
  return true;
}

function imagePart(image: string, mime: string): Record<string, unknown> {
  return { type: 'input_image', image_url: `data:${mime};base64,${image}` };
}

const CONFIRM_INSTRUCTIONS = [
  'You confirm the product a blind shopper holds. Look at the photo and the request.',
  'First parse the request into asked attributes: brand (the maker), product (the kind),',
  'variant (flavour or type), size (weight, volume or count); unknown is null.',
  'Then copy only text you can really read on the held product into read, transliterated',
  'into the script of the request so it can be spoken; anything unreadable is null,',
  'never a guess. label_name names the held product as brand plus kind',
  '(such as Guedila water) from what you read, or empty when nothing is readable.',
  'unreadable lists each asked attribute you could not read. Verdict: picture when',
  'picture_problem naming it (blurry, dark, glare, far, turned); else no when any asked',
  'attribute is contradicted by what you read; else unsure when any asked attribute is',
  'unreadable; else yes. A wrong yes is the worst outcome: when in doubt, unsure.',
].join(' ');

const DETAIL_INSTRUCTIONS = [
  'You read one label detail for a blind shopper: date, size, price or ingredients.',
  'Copy the exact printed text word for word into text, in full for ingredients, or null',
  'when it cannot be read, with reason naming why (too_small, blurry, dark, glare,',
  'turned, not_visible). Never summarize, guess or rephrase. Never identify medicines',
  'and never judge whether a food is safe: read the printed text only.',
].join(' ');

export async function confirmInHand(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  args: ConfirmArgs,
): Promise<ConfirmResult> {
  const input = [
    { role: 'system', content: CONFIRM_INSTRUCTIONS },
    {
      role: 'user',
      content: [{ type: 'input_text', text: `Request: ${args.request}` }, imagePart(args.image, args.mime)],
    },
  ];
  const started = Date.now();
  const read = await callSparkJson({ fetchImpl, apiBase, apiKey, input, effort: 'low', schema: CONFIRM_SCHEMA, guard: isConfirmRead });
  return { read, readMs: Date.now() - started };
}

export async function readLabelDetail(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  args: DetailArgs,
): Promise<DetailResult> {
  const input = [
    { role: 'system', content: DETAIL_INSTRUCTIONS },
    {
      role: 'user',
      content: [{ type: 'input_text', text: `Detail: ${args.detail}` }, imagePart(args.image, args.mime)],
    },
  ];
  const started = Date.now();
  const read = await callSparkJson({ fetchImpl, apiBase, apiKey, input, effort: 'low', schema: DETAIL_SCHEMA, guard: isDetailRead });
  return { read, readMs: Date.now() - started };
}

function detailField(value: unknown): DetailKind | null {
  return value === 'date' || value === 'size' || value === 'price' || value === 'ingredients' ? value : null;
}

export async function confirmRoute(body: unknown, env: Env): Promise<Response> {
  const record = (body ?? {}) as { request?: unknown; image?: unknown; mime?: unknown };
  const wanted = textField(record.request);
  const image = textField(record.image);
  if (!wanted || !image) {
    return Response.json({ ok: false, error: 'missing request or image' }, { status: 400 });
  }
  try {
    const result = await confirmInHand(fetch, env.META_API_BASE, env.META_API_KEY, {
      request: wanted,
      image,
      mime: mimeField(record.mime),
    });
    await recordSparkCost(env);
    return Response.json({ ok: true, read: result.read, readMs: result.readMs });
  } catch (err) {
    return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
  }
}

export async function detailRoute(body: unknown, env: Env): Promise<Response> {
  const record = (body ?? {}) as { detail?: unknown; image?: unknown; mime?: unknown };
  const detail = detailField(record.detail);
  const image = textField(record.image);
  if (!detail || !image) {
    return Response.json({ ok: false, error: 'missing detail or image' }, { status: 400 });
  }
  try {
    const result = await readLabelDetail(fetch, env.META_API_BASE, env.META_API_KEY, {
      detail,
      image,
      mime: mimeField(record.mime),
    });
    await recordSparkCost(env);
    return Response.json({ ok: true, read: result.read, readMs: result.readMs });
  } catch (err) {
    return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
  }
}
