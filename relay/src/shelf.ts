// Shelf reads with Muse Spark: which English phrase names the package,
// and what each outlined crop really says. Every call uses the strict
// schema gate, and the relay checks the reads carry exactly the crop
// ids it sent: one answer per crop, never fewer, never invented.
import { callSparkJson } from './spark.ts';
import type { SparkSchema } from './spark.ts';

export type ShelfVerdict = 'yes' | 'no' | 'unsure';

export interface ShelfCrop {
  id: string;
  image: string;
  mime: string;
}

export interface ShelfRead {
  id: string;
  brand_text: string | null;
  size_text: string | null;
  verdict: ShelfVerdict;
  spoken: string;
}

export interface ShelfResult {
  reads: ShelfRead[];
  readMs: number;
}

export type SceneKind = 'shelf' | 'floor' | 'other';

export interface SceneResult {
  scene: SceneKind;
  kinds: string[];
  aisle_hint: string | null;
  /** What the shelf mostly holds, as a shop sign names it in the shopper's language. */
  shelf_label: string | null;
  /** Whether the shelf holds the kind of product requested. */
  fits_request: boolean;
}

export interface ClassifyArgs {
  request: string;
  image: string;
  mime: string;
  language?: string;
}

export interface PhraseArgs {
  request: string;
  image: string;
  mime: string;
}

export interface ReadArgs {
  request: string;
  crops: ShelfCrop[];
  effort?: string;
}

const PHRASE_SCHEMA: SparkSchema = {
  name: 'pick_package_phrase',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      phrase: { type: 'string' },
    },
    required: ['phrase'],
  },
  strict: true,
};

const READS_SCHEMA: SparkSchema = {
  name: 'read_shelf_labels',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reads: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            brand_text: { type: ['string', 'null'] },
            size_text: { type: ['string', 'null'] },
            verdict: { type: 'string', enum: ['yes', 'no', 'unsure'] },
            spoken: { type: 'string' },
          },
          required: ['id', 'brand_text', 'size_text', 'verdict', 'spoken'],
        },
      },
    },
    required: ['reads'],
  },
  strict: true,
};

function isPhrase(value: unknown): value is { phrase: string } {
  if (!value || typeof value !== 'object') return false;
  const phrase = (value as Record<string, unknown>)['phrase'];
  return typeof phrase === 'string' && phrase.trim().length > 0 && phrase.trim().split(/\s+/).length <= 3;
}

function isRead(value: unknown): value is ShelfRead {
  if (!value || typeof value !== 'object') return false;
  const read = value as Record<string, unknown>;
  return (
    typeof read['id'] === 'string' &&
    (typeof read['brand_text'] === 'string' || read['brand_text'] === null) &&
    (typeof read['size_text'] === 'string' || read['size_text'] === null) &&
    (read['verdict'] === 'yes' || read['verdict'] === 'no' || read['verdict'] === 'unsure') &&
    typeof read['spoken'] === 'string'
  );
}

const CLASSIFY_SCHEMA: SparkSchema = {
  name: 'classify_shelf_scene',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scene: { type: 'string', enum: ['shelf', 'floor', 'other'] },
      kinds: { type: 'array', items: { type: 'string' } },
      aisle_hint: { type: ['string', 'null'] },
      shelf_label: { type: ['string', 'null'] },
      fits_request: { type: 'boolean' },
    },
    required: ['scene', 'kinds', 'aisle_hint', 'shelf_label', 'fits_request'],
  },
  strict: true,
};

function isScene(value: unknown): value is SceneResult {
  if (!value || typeof value !== 'object') return false;
  const scene = value as Record<string, unknown>;
  return (
    (scene['scene'] === 'shelf' || scene['scene'] === 'floor' || scene['scene'] === 'other') &&
    Array.isArray(scene['kinds']) &&
    (scene['kinds'] as unknown[]).every((kind) => typeof kind === 'string') &&
    (typeof scene['aisle_hint'] === 'string' || scene['aisle_hint'] === null) &&
    (typeof scene['shelf_label'] === 'string' || scene['shelf_label'] === null) &&
    typeof scene['fits_request'] === 'boolean'
  );
}

function isReads(value: unknown): value is { reads: ShelfRead[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as Record<string, unknown>)['reads']) &&
    ((value as Record<string, unknown>)['reads'] as unknown[]).every(isRead)
  );
}

function imagePart(image: string, mime: string): Record<string, unknown> {
  return { type: 'input_image', image_url: `data:${mime};base64,${image}` };
}

const PHRASE_INSTRUCTIONS = [
  'You name the package a blind shopper wants, for a segmentation model.',
  'Look at the shelf photo and the request. Answer with one short English noun phrase,',
  'one or two words, naming the kind of package: "bottle", "rice bag", "jar", "box".',
  'Name the kind, never a brand.',
].join(' ');

export async function pickPackagePhrase(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  args: PhraseArgs,
): Promise<string> {
  const input = [
    { role: 'system', content: PHRASE_INSTRUCTIONS },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: `Request: ${args.request}` },
        imagePart(args.image, args.mime),
      ],
    },
  ];
  const answer = await callSparkJson({ fetchImpl, apiBase, apiKey, input, effort: 'minimal', schema: PHRASE_SCHEMA, guard: isPhrase });
  return answer.phrase.trim();
}

const READ_INSTRUCTIONS = [
  'You read product labels for a blind shopper. Each crop shows one outlined product.',
  'Copy only text you can really read on that product; anything unreadable is null, never a guess.',
  'brand_text is the brand or maker, size_text the variant or size. verdict is yes only when the crop is',
  'exactly what was requested, brand and size alike; no when it is something else; unsure when the label',
  'does not settle it. When the request names a kind or variety (white rice, basmati, red lentils), the',
  'label must name that same one: a label naming another variety is no, even when it loosely fits the words',
  '(Riz Basmati is no for white rice, Riz blanc is no for basmati). A reflection of a product in glass, a window or a mirror, or a picture of one, is',
  'never the product: its verdict is no. spoken names the crop in a few words for speech. Answer every crop',
  'id exactly once.',
].join(' ');

const CLASSIFY_INSTRUCTIONS = [
  'You orient a blind shopper. Look at the phone photo and say what it shows.',
  'scene is shelf when products on a shelf fill the view, floor when the camera points at the floor,',
  'other otherwise. kinds lists the package kinds visible on a shelf as short English plurals,',
  'such as ["bags", "jars"]; empty when no shelf is in view. aisle_hint names where to ask for the',
  'requested product, such as "the water aisle", or null when the shelf already shows its kind.',
  'shelf_label names what the shelf mostly holds in one or two words in the shopper\'s language (en, ar or fr), the way a',
  'shop sign would ("biscuits", "البسكويت"); null when no shelf is in view or it holds no clear kind. fits_request is true',
  'when the shelf holds the kind of product requested (any rice for rice, any water bottle for water), false when it holds',
  'another kind or no shelf is in view. When you cannot tell, fits_request is true: the shopper looks here before being',
  'sent elsewhere.',
].join(' ');

export async function classifyScene(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  args: ClassifyArgs,
): Promise<SceneResult> {
  const input = [
    { role: 'system', content: CLASSIFY_INSTRUCTIONS },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: `Request: ${args.request}\nShopper's language: ${args.language === 'ar' || args.language === 'fr' ? args.language : 'en'}` },
        imagePart(args.image, args.mime),
      ],
    },
  ];
  return callSparkJson({ fetchImpl, apiBase, apiKey, input, effort: 'minimal', schema: CLASSIFY_SCHEMA, guard: isScene });
}

export async function readShelfLabels(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  args: ReadArgs,
): Promise<ShelfResult> {
  if (args.crops.length === 0 || args.crops.length > 8) {
    throw new Error('read-shelf needs one to eight crops');
  }
  const content: Record<string, unknown>[] = [{ type: 'input_text', text: `Request: ${args.request}` }];
  for (const crop of args.crops) {
    content.push({ type: 'input_text', text: `Crop ${crop.id}:` });
    content.push(imagePart(crop.image, crop.mime));
  }
  const input = [
    { role: 'system', content: READ_INSTRUCTIONS },
    { role: 'user', content },
  ];
  const started = Date.now();
  const answer = await callSparkJson({ fetchImpl, apiBase, apiKey, input, effort: args.effort ?? 'minimal', schema: READS_SCHEMA, guard: isReads });
  const wanted = new Set(args.crops.map((crop) => crop.id));
  const seen = new Set(answer.reads.map((read) => read.id));
  if (seen.size !== answer.reads.length || wanted.size !== seen.size || [...wanted].some((id) => !seen.has(id))) {
    throw new Error('shelf reads do not match the crop ids');
  }
  return { reads: answer.reads, readMs: Date.now() - started };
}
