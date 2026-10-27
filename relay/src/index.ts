// Ittro relay: the phone never holds the Meta API key. Only this relay
// calls Meta, and only with strict structured output.

export type Verdict = 'yes' | 'no' | 'cannot_verify';

export interface ConfirmAnswer {
  verdict: Verdict;
  spoken_summary: string;
  label_text: string | null;
}

interface JsonSchemaFormat {
  type: 'json_schema';
  name: string;
  schema: Record<string, unknown>;
  strict: true;
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

interface SparkCall {
  fetchImpl: typeof fetch;
  apiBase: string | undefined;
  apiKey: string | undefined;
  input: unknown;
  effort?: string;
}

// Every Muse Spark call goes through here. The answer is accepted only
// when the response completed AND its output parses against the schema
// shape. Anything else is an error, never an empty default.
export async function callSpark({ fetchImpl, apiBase, apiKey, input, effort = 'low' }: SparkCall): Promise<ConfirmAnswer> {
  if (!apiBase) throw new Error('missing META_API_BASE');
  if (!apiKey) throw new Error('missing META_API_KEY');

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
      text: { format: { type: 'json_schema', ...CONFIRM_SCHEMA } as JsonSchemaFormat },
    }),
  });

  if (!res.ok) {
    throw new Error(`spark http ${res.status}`);
  }
  const body = (await res.json()) as {
    status?: string;
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (body.status !== 'completed') {
    throw new Error(`spark not completed: ${body.status ?? 'unknown'}`);
  }
  const text: unknown = body.output_text ?? body.output?.[0]?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('spark answer has no text output');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('spark answer is not valid JSON');
  }
  if (!isConfirmAnswer(parsed)) {
    throw new Error('spark answer fails schema gate');
  }
  return parsed;
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

interface Env {
  META_API_BASE?: string;
  META_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/spark') {
      try {
        const { input, effort } = (await request.json()) as { input: unknown; effort?: string };
        const answer = await callSpark({
          fetchImpl: fetch,
          apiBase: env.META_API_BASE,
          apiKey: env.META_API_KEY,
          input,
          effort,
        });
        return Response.json({ ok: true, answer });
      } catch (err) {
        return Response.json({ ok: false, error: String((err as Error)?.message ?? err) }, { status: 502 });
      }
    }
    return new Response('not found', { status: 404 });
  },
};
