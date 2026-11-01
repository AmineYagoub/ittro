// The grounding find: Muse Spark reads the shelf photo and boxes every
// package that is the requested product, on a 0-1000 grid, with the
// name printed on it; SAM 3.1 then cuts each box into an outline. Two
// calls in place of a package phrase, SAM on every package and crop
// reads. On the founder's shelf video (1 Nov, 21 frames x 8 requests,
// run twice) it found 78 of 79 products in view, invented none of 80
// not in view, and outlined in 3.7 to 4.1 s at the median.
import { callSparkJson } from './spark.ts';
import type { SparkSchema } from './spark.ts';
import { outlineProducts } from './sam.ts';
import type { SamOutline } from './sam.ts';
import { mimeField, textField } from './bodies.ts';
import { recordSamCost, recordSparkCost } from './gate.ts';
import type { Env } from './gate.ts';

export interface FindArgs {
  request: string;
  image: string;
  mime: string;
  w: number;
  h: number;
}

export interface FoundOutline extends SamOutline {
  // The name printed on the package, as Muse Spark read it.
  label: string;
}

export interface FindResult {
  outlines: FoundOutline[];
  groundMs: number;
  samMs: number;
  maskMs: number;
}

interface Grounded {
  box: number[];
  label: string;
  is_requested: boolean;
}

// SAM takes at most 16 boxes in one call.
const MAX_BOXES = 16;

const GROUNDING_SCHEMA: SparkSchema = {
  name: 'grounding',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            box: { type: 'array', items: { type: 'integer' } },
            label: { type: 'string' },
            is_requested: { type: 'boolean' },
          },
          required: ['box', 'label', 'is_requested'],
        },
      },
    },
    required: ['items'],
  },
  strict: true,
};

function isGrounding(value: unknown): value is { items: Grounded[] } {
  if (!value || typeof value !== 'object') return false;
  const items = (value as Record<string, unknown>)['items'];
  return (
    Array.isArray(items) &&
    items.every((item) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      return (
        Array.isArray(entry['box']) &&
        (entry['box'] as unknown[]).every((n) => typeof n === 'number') &&
        typeof entry['label'] === 'string' &&
        typeof entry['is_requested'] === 'boolean'
      );
    })
  );
}

// The first round invented Masaad bottles on honey jars and gave the
// request back as the label; asking for the printed name and a flag
// fixed both. A general request must match every variety, or rice
// missed four frames.
function groundingText(request: string): string {
  return [
    `You are an object grounding expert. A blind shopper asked for: «${request}». Read the package labels and find every package that is this product.`,
    'A general request (rice) matches every variety of it; a request naming a variety (white rice, basmati) matches only that variety.',
    'For each, give its box as [x_min, y_min, x_max, y_max] on a 0-1000 grid of this image, label: the name printed on that package as you read it,',
    "never the request's words, and is_requested: true only when that printed name is this product (a different kind of product, a reflection or a",
    'picture is false). Return an empty list if none is in view. Do not miss any.',
  ].join(' ');
}

function toPixels(grid: number[], w: number, h: number): [number, number, number, number] | null {
  if (grid.length !== 4) {
    return null;
  }
  const clamp = (v: number, hi: number): number => Math.max(0, Math.min(hi - 1, Math.round(v)));
  const [x1, y1, x2, y2] = grid as [number, number, number, number];
  const box: [number, number, number, number] = [clamp((x1 * w) / 1000, w), clamp((y1 * h) / 1000, h), clamp((x2 * w) / 1000, w), clamp((y2 * h) / 1000, h)];
  return box[2] > box[0] && box[3] > box[1] ? box : null;
}

// SAM numbers its outlines after the boxes it was given (1, 2, ...);
// an outline without its number takes the label of the box it centres in.
function labelFor(outline: SamOutline, boxes: Array<{ box: number[]; label: string }>): string {
  const byId = boxes[outline.id - 1];
  if (byId) {
    return byId.label;
  }
  const cx = (outline.box.x1 + outline.box.x2) / 2;
  const cy = (outline.box.y1 + outline.box.y2) / 2;
  const gap = (box: number[]): number => Math.abs(((box[0] as number) + (box[2] as number)) / 2 - cx) + Math.abs(((box[1] as number) + (box[3] as number)) / 2 - cy);
  return [...boxes].sort((a, b) => gap(a.box) - gap(b.box))[0]?.label ?? '';
}

export async function findOnShelf(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  args: FindArgs,
  onGrounded: () => Promise<void> = async () => undefined,
): Promise<FindResult> {
  if (!Number.isInteger(args.w) || args.w <= 0 || !Number.isInteger(args.h) || args.h <= 0) {
    throw new Error('find needs the photo size');
  }
  const started = Date.now();
  const input = [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: groundingText(args.request) },
        { type: 'input_image', image_url: `data:${args.mime};base64,${args.image}` },
      ],
    },
  ];
  const answer = await callSparkJson({ fetchImpl, apiBase, apiKey, input, effort: 'minimal', schema: GROUNDING_SCHEMA, guard: isGrounding });
  const groundMs = Date.now() - started;
  await onGrounded();
  const boxes = answer.items
    .filter((item) => item.is_requested)
    .map((item) => ({ box: toPixels(item.box, args.w, args.h), label: item.label.trim() }))
    .filter((item): item is { box: [number, number, number, number]; label: string } => item.box !== null)
    .slice(0, MAX_BOXES);
  if (boxes.length === 0) {
    return { outlines: [], groundMs, samMs: 0, maskMs: 0 };
  }
  const prompt = '<0f>' + boxes.map(({ box }, at) => `${at + 1}<|box;x1=${box[0]};y1=${box[1]};x2=${box[2]};y2=${box[3]};w=${args.w};h=${args.h}|>`).join(',');
  const cut = await outlineProducts(fetchImpl, apiBase, apiKey, { image: args.image, mime: args.mime, phrase: prompt, w: args.w, h: args.h });
  return {
    outlines: cut.outlines.map((outline) => ({ ...outline, label: labelFor(outline, boxes) })),
    groundMs,
    samMs: cut.samMs,
    maskMs: cut.maskMs,
  };
}

export async function findRoute(body: unknown, env: Env): Promise<Response> {
  const record = (body ?? {}) as { request?: unknown; image?: unknown; mime?: unknown; w?: unknown; h?: unknown };
  const wanted = textField(record.request);
  const image = textField(record.image);
  const w = typeof record.w === 'number' ? record.w : 0;
  const h = typeof record.h === 'number' ? record.h : 0;
  if (!wanted || !image || !Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) {
    return Response.json({ ok: false, error: 'missing request, image or photo size' }, { status: 400 });
  }
  try {
    const result = await findOnShelf(fetch, env.META_API_BASE, env.META_API_KEY, { request: wanted, image, mime: mimeField(record.mime), w, h }, () => recordSparkCost(env));
    if (result.outlines.length > 0 || result.samMs > 0) {
      await recordSamCost(env);
    }
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
  }
}
