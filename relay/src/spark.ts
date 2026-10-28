// Muse Spark plumbing: strict schemas, the schema gates and the call.
// The answer is accepted only when the response completed AND its
// output parses against the schema shape. Anything else is an error,
// never an empty default.
export type Verdict = 'yes' | 'no' | 'cannot_verify';

export interface ConfirmAnswer {
  verdict: Verdict;
  spoken_summary: string;
  label_text: string | null;
}

export const INTENTS = [
  'request_product',
  'confirm_yes',
  'confirm_no',
  'where_is_it',
  'is_this_right',
  'read_detail',
  'got_it',
  'guide_me',
  'read_again',
  'keep_looking',
  'find_another',
  'start_over',
  'done',
  'ask_someone',
  'add_helper',
  'cancel',
  'repeat',
  'shorter',
  'more_detail',
  'speak_faster',
  'speak_slower',
  'sounds_tour',
  'next',
  'skip',
  'help',
  'speak_language',
  'stop',
  'wake',
  'not_understood',
] as const;

export type Intent = (typeof INTENTS)[number];

export type SpokenLanguage = 'en' | 'ar' | 'fr';

export type LabelDetail = 'date' | 'size' | 'price' | 'ingredients';

export interface UnderstandAnswer {
  intent: Intent;
  language_spoken: SpokenLanguage;
  product_text: string | null;
  items: string[] | null;
  detail: LabelDetail | null;
  target_language: SpokenLanguage | null;
  helper_name: string | null;
}

interface JsonSchemaFormat {
  type: 'json_schema';
  name: string;
  schema: Record<string, unknown>;
  strict: true;
}

export interface SparkSchema {
  name: string;
  schema: Record<string, unknown>;
  strict: boolean;
}

export const CONFIRM_SCHEMA = {
  name: 'confirm_product',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      verdict: { type: 'string', enum: ['yes', 'no', 'cannot_verify'] },
      spoken_summary: { type: 'string' },
      label_text: { type: ['string', 'null'] },
    },
    required: ['verdict', 'spoken_summary', 'label_text'],
  },
  strict: true,
};

export const UNDERSTAND_SCHEMA = {
  name: 'understand_utterance',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: 'string', enum: [...INTENTS] },
      language_spoken: { type: 'string', enum: ['en', 'ar', 'fr'] },
      product_text: { type: ['string', 'null'] },
      items: { type: ['array', 'null'], items: { type: 'string' } },
      detail: { type: ['string', 'null'], enum: ['date', 'size', 'price', 'ingredients', null] },
      target_language: { type: ['string', 'null'], enum: ['en', 'ar', 'fr', null] },
      helper_name: { type: ['string', 'null'] },
    },
    required: ['intent', 'language_spoken', 'product_text', 'items', 'detail', 'target_language', 'helper_name'],
  },
  strict: true,
};

interface SparkCall {
  fetchImpl: typeof fetch;
  apiBase: string | undefined;
  apiKey: string | undefined;
  input: unknown;
  effort?: string;
}

interface SparkJsonCall<T> extends SparkCall {
  schema: SparkSchema;
  guard: (value: unknown) => value is T;
}

export async function callSparkJson<T>({ fetchImpl, apiBase, apiKey, input, effort = 'low', schema, guard }: SparkJsonCall<T>): Promise<T> {
  if (!apiBase) throw new Error('relay not configured: META_API_BASE');
  if (!apiKey) throw new Error('relay not configured: META_API_KEY');

  const res = await fetchImpl(`${apiBase}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'muse-spark-1.3',
      reasoning: { effort },
      input,
      text: { format: { type: 'json_schema', ...schema } as JsonSchemaFormat },
    }),
  });

  if (!res.ok) {
    throw new Error(`spark http ${res.status}`);
  }
  const body = (await res.json()) as {
    status?: string;
    output_text?: unknown;
    output?: Array<{ type?: string; content?: Array<{ text?: unknown }> }>;
  };

  if (body.status !== 'completed') {
    throw new Error(`spark not completed: ${body.status ?? 'unknown'}`);
  }
  const items = Array.isArray(body.output) ? body.output : [];
  const message = items.find((item) => item?.type === 'message') ?? items[0];
  const text: unknown = body.output_text ?? message?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('spark answer has no text output');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('spark answer is not valid JSON');
  }
  if (!guard(parsed)) {
    throw new Error('spark answer fails schema gate');
  }
  return parsed;
}

export async function callSpark(args: SparkCall): Promise<ConfirmAnswer> {
  return callSparkJson({ ...args, schema: CONFIRM_SCHEMA, guard: isConfirmAnswer });
}

function isConfirmAnswer(value: unknown): value is ConfirmAnswer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v['verdict'] === 'yes' || v['verdict'] === 'no' || v['verdict'] === 'cannot_verify') &&
    typeof v['spoken_summary'] === 'string' &&
    (typeof v['label_text'] === 'string' || v['label_text'] === null)
  );
}

export function isUnderstandAnswer(value: unknown): value is UnderstandAnswer {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (INTENTS as readonly unknown[]).includes(v['intent']) &&
    (v['language_spoken'] === 'en' || v['language_spoken'] === 'ar' || v['language_spoken'] === 'fr') &&
    (typeof v['product_text'] === 'string' || v['product_text'] === null) &&
    (v['items'] === null || (Array.isArray(v['items']) && v['items'].every((item) => typeof item === 'string'))) &&
    (v['detail'] === null || v['detail'] === 'date' || v['detail'] === 'size' || v['detail'] === 'price' || v['detail'] === 'ingredients') &&
    (v['target_language'] === null || v['target_language'] === 'en' || v['target_language'] === 'ar' || v['target_language'] === 'fr') &&
    (typeof v['helper_name'] === 'string' || v['helper_name'] === null)
  );
}
