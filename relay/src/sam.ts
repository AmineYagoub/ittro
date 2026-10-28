// SAM 3.1 outlines through the Meta Model API: one noun phrase plus
// one shelf photo in, one box per matching product out. The stream is
// special-token text; the relay parses it strictly and returns only
// the boxes. Mask payloads stay on the wire: their codec is published
// only inside Meta's client libraries, and boxes locate every product.
export interface SamBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  confidence: number | null;
}

export interface SamOutline {
  id: number;
  frame: number;
  box: SamBox;
}

export interface OutlineResult {
  outlines: SamOutline[];
  samMs: number;
}

export interface OutlineArgs {
  image: string;
  mime: string;
  phrase: string;
}

interface BoxFields {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  confidence: number | null;
}

function parseBox(token: string): BoxFields {
  const fields = new Map<string, string>();
  for (const part of token.split(';')) {
    const at = part.indexOf('=');
    if (at > 0) {
      fields.set(part.slice(0, at), part.slice(at + 1));
    }
  }
  const need = ['x1', 'y1', 'x2', 'y2', 'w', 'h'].map((key) => Number(fields.get(key)));
  if (need.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('sam line fails to parse: bad box');
  }
  const [x1, y1, x2, y2, w, h] = need as [number, number, number, number, number, number];
  if (x2 < x1 || y2 < y1 || w === 0 || h === 0 || x2 > w || y2 > h) {
    throw new Error('sam line fails to parse: box outside image');
  }
  const raw = fields.get('c');
  const confidence = raw === undefined ? null : Number(raw);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new Error('sam line fails to parse: bad confidence');
  }
  return { x1, y1, x2, y2, w, h, confidence };
}

function parseRecord(piece: string, frame: number): SamOutline {
  const head = piece.match(/^(\d+)<\|box;([^|]*)\|><\|mask;/);
  if (!head) {
    throw new Error('sam line fails to parse: bad record');
  }
  const afterMask = piece.slice(head[0].length);
  const data = afterMask.match(/data=(\d+),(\d+),[~!]/);
  if (!data || !afterMask.endsWith('|>')) {
    throw new Error('sam line fails to parse: bad mask');
  }
  return { id: Number(head[1]), frame, box: parseBox(head[2] ?? '') };
}

function parseLine(line: string): SamOutline[] {
  const marker = line.match(/^<(\d+)f>/);
  if (!marker) {
    throw new Error('sam line fails to parse: no frame marker');
  }
  const frame = Number(marker[1]);
  const rest = line.slice(marker[0].length);
  if (rest.length === 0) {
    throw new Error('sam line fails to parse: no records');
  }
  return rest.split(/,(?=\d+<\|box;)/).map((piece) => parseRecord(piece, frame));
}

export function parseSamText(text: string): SamOutline[] {
  const outlines: SamOutline[] = [];
  for (const line of text.split('\n').map((part) => part.trim()).filter((part) => part.length > 0)) {
    outlines.push(...parseLine(line));
  }
  return outlines;
}

interface SseEvent {
  name: string;
  data: string[];
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
  });
  if (!res.ok) {
    throw new Error(`sam http ${res.status}`);
  }
  let text = '';
  let status: string | null = null;
  for (const event of splitEvents(await res.text())) {
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
      const record = parsed as { delta?: unknown; response?: { status?: unknown } };
      if (event.name === 'response.output_text.delta' && typeof record.delta === 'string') {
        text += record.delta;
      }
      if (event.name === 'response.completed') {
        status = typeof record.response?.status === 'string' ? record.response.status : 'unknown';
      }
    }
  }
  if (status !== 'completed') {
    throw new Error(`sam not completed: ${status ?? 'unknown'}`);
  }
  return { outlines: parseSamText(text), samMs: Date.now() - started };
}
