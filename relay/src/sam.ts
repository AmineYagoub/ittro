// SAM 3.1 outlines through the Meta Model API: one noun phrase plus
// one shelf photo in, one shape-following mask per matching product
// out. Meta's parser reads the stream strictly; the relay decodes each
// mask to a small polygon on the server, so the phone never pays the
// JavaScript decode that froze the test project's screen.
import { parseImageStream, recordsOfKind, ResponsesStreamError } from '@meta-sam/parser';
import { traceMaskOutline } from './masks.ts';
import { metaDeadline } from './spark.ts';

export interface SamBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  confidence: number | null;
}

export interface SamMask {
  points: number[];
}

export interface SamOutline {
  id: number;
  frame: number;
  box: SamBox;
  mask?: SamMask;
}

export interface OutlineResult {
  outlines: SamOutline[];
  samMs: number;
  maskMs: number;
}

export interface OutlineArgs {
  image: string;
  mime: string;
  phrase: string;
  w: number;
  h: number;
}

interface SseEvent {
  name: string;
  data: string[];
}

interface WireEvent {
  type: string;
  [key: string]: unknown;
}

function splitEvents(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of body.split('\n\n')) {
    let name = '';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) {
        name = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).trim());
      }
    }
    if (name || data.length > 0) {
      events.push({ name, data });
    }
  }
  return events;
}

function laneIds(record: Record<string, unknown>): { item_id: string; output_index: number; content_index: number } {
  return {
    item_id: typeof record['item_id'] === 'string' ? record['item_id'] : 'msg-1',
    output_index: typeof record['output_index'] === 'number' ? record['output_index'] : 0,
    content_index: typeof record['content_index'] === 'number' ? record['content_index'] : 0,
  };
}

function toWireEvents(body: string): { events: WireEvent[]; text: string; finalized: boolean } {
  const events: WireEvent[] = [];
  let text = '';
  let finalized = false;
  for (const event of splitEvents(body)) {
    for (const chunk of event.data) {
      if (chunk === '[DONE]') {
        continue;
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(chunk);
      } catch {
        throw new Error('sam stream fails to parse');
      }
      const record = (parsed ?? {}) as Record<string, unknown>;
      if (event.name === 'response.output_text.delta' && typeof record['delta'] === 'string') {
        text += record['delta'];
        events.push({ ...laneIds(record), type: event.name, delta: record['delta'] });
      } else if (event.name === 'response.output_text.done' && typeof record['text'] === 'string') {
        finalized = true;
        events.push({ ...laneIds(record), type: event.name, text: record['text'] });
      } else if (event.name === 'response.content_part.done') {
        finalized = true;
        events.push({ ...record, type: event.name });
      } else if (event.name === 'response.completed') {
        const status = (record['response'] as { status?: unknown } | undefined)?.status;
        if (status !== undefined && status !== 'completed') {
          throw new Error(`sam not completed: ${String(status)}`);
        }
        events.push({ type: event.name });
      } else if (event.name === 'response.failed' || event.name === 'response.incomplete' || event.name === 'error') {
        events.push({ ...record, type: event.name });
      } else if (event.name === 'response.refusal.delta' || event.name === 'response.refusal.done') {
        events.push({ ...laneIds(record), ...record, type: event.name });
      }
    }
  }
  return { events, text, finalized };
}

function samError(error: unknown): Error {
  if (error instanceof ResponsesStreamError) {
    if (error.code === 'response_refusal') {
      return new Error('sam refused the request');
    }
    if (error.code === 'response_failed' || error.code === 'response_error') {
      return new Error(`sam failed: ${error.message}`);
    }
    return new Error('sam stream fails to parse');
  }
  return error as Error;
}

export async function outlineProducts(
  fetchImpl: typeof fetch,
  apiBase: string | undefined,
  apiKey: string | undefined,
  args: OutlineArgs,
): Promise<OutlineResult> {
  if (!apiBase) throw new Error('relay not configured: META_API_BASE');
  if (!apiKey) throw new Error('relay not configured: META_API_KEY');
  const phrase = args.phrase.trim();
  if (phrase.length === 0) {
    throw new Error('outline needs a phrase');
  }
  if (!Number.isInteger(args.w) || args.w <= 0 || !Number.isInteger(args.h) || args.h <= 0) {
    throw new Error('outline needs the photo size');
  }
  const started = Date.now();
  const res = await fetchImpl(`${apiBase}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: 'sam-3.1',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: phrase },
            { type: 'input_image', image_url: `data:${args.mime};base64,${args.image}` },
          ],
        },
      ],
      stream: true,
      metadata: { mask_encoding: 'one_bit' },
    }),
    signal: metaDeadline(),
  });
  if (!res.ok) {
    throw new Error(`sam http ${res.status}`);
  }
  const { events, text, finalized } = toWireEvents(await res.text());
  if (!finalized) {
    const done = { item_id: 'msg-1', output_index: 0, content_index: 0, type: 'response.output_text.done', text };
    const terminal = events.findIndex((event) => event.type === 'response.completed');
    if (terminal >= 0) {
      events.splice(terminal, 0, done);
    } else {
      events.push(done);
    }
  }
  async function* source(): AsyncIterable<WireEvent> {
    for (const event of events) {
      yield event;
    }
  }
  let result;
  try {
    result = await parseImageStream(source()).finalResult;
  } catch (error) {
    throw samError(error);
  }
  if (result.outcome.status !== 'completed') {
    const detail = result.outcome.reason === 'response' ? (result.outcome.detail ?? 'response') : 'eof';
    throw new Error(`sam not completed: ${detail}`);
  }
  const boxRecords = recordsOfKind(result.records, 'box');
  const maskRecords = recordsOfKind(result.records, 'mask');
  if (boxRecords.length === 0 && result.rawOutput.trim().length > 0) {
    const first = result.diagnostics.find((item) => item.severity === 'error');
    throw new Error(`sam line fails to parse: ${first?.message ?? 'no outlines'}`);
  }
  const masksByObject = new Map<string, (typeof maskRecords)[number]>();
  for (const mask of maskRecords) {
    if (!masksByObject.has(mask.objectId)) {
      masksByObject.set(mask.objectId, mask);
    }
  }
  const outlines: SamOutline[] = [];
  let maskMs = 0;
  for (const box of boxRecords) {
    const id = Number(box.objectId);
    const outline: SamBox = {
      x1: box.left,
      y1: box.top,
      x2: box.right - 1,
      y2: box.bottom - 1,
      w: args.w,
      h: args.h,
      confidence: box.confidence ?? null,
    };
    if (
      !Number.isInteger(id) ||
      id < 0 ||
      !Number.isInteger(outline.x1) ||
      !Number.isInteger(outline.y1) ||
      outline.x2 < outline.x1 ||
      outline.y2 < outline.y1 ||
      outline.x1 < 0 ||
      outline.y1 < 0 ||
      outline.x2 >= args.w ||
      outline.y2 >= args.h
    ) {
      throw new Error('sam line fails to parse: box outside image');
    }
    const entry: SamOutline = { id, frame: 0, box: outline };
    const mask = masksByObject.get(box.objectId);
    if (mask) {
      const decodeStart = Date.now();
      const points = traceMaskOutline(mask.mask, mask.bounds);
      maskMs += Date.now() - decodeStart;
      if (points) {
        entry.mask = { points };
      }
    }
    outlines.push(entry);
  }
  return { outlines, samMs: Date.now() - started, maskMs };
}
