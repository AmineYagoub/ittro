import Constants from 'expo-constants';

export interface RelayConfig {
  url: string;
  accessCode: string;
}

export function relayConfig(): RelayConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const url = process.env['EXPO_PUBLIC_RELAY_URL'] ?? extra['relayUrl'];
  const accessCode = process.env['EXPO_PUBLIC_ACCESS_CODE'] ?? extra['accessCode'];
  return {
    url: typeof url === 'string' ? url : 'https://ittro.djazair.dev',
    accessCode: typeof accessCode === 'string' ? accessCode : '',
  };
}

export interface UnderstandContext {
  transcript: string;
  language: string;
  step: string;
  pending_question: string | null;
  pending_request: string | null;
  last_line: string | null;
  effort: string;
}

export interface UnderstandAnswer {
  intent: string;
  language_spoken: string;
  product_text: string | null;
  items: string[] | null;
  detail: string | null;
  target_language: string | null;
  helper_name: string | null;
}

interface UnderstandResponse {
  ok: boolean;
  answer?: UnderstandAnswer;
  error?: string;
}

export async function understandUtterance(context: UnderstandContext): Promise<UnderstandAnswer> {
  const { url, accessCode } = relayConfig();
  const res = await fetch(`${url}/understand`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessCode}`,
    },
    body: JSON.stringify(context),
  });
  const body = (await res.json()) as UnderstandResponse;
  if (!res.ok || !body.ok || !body.answer) {
    throw new Error(body.error ?? `understand http ${res.status}`);
  }
  return body.answer;
}

export interface ShelfBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  confidence: number | null;
}

export interface ShelfOutline {
  id: number;
  frame: number;
  box: ShelfBox;
}

export interface ShelfCrop {
  id: string;
  image: string;
  mime: string;
}

export interface ShelfRead {
  id: string;
  brand_text: string | null;
  size_text: string | null;
  verdict: 'yes' | 'no' | 'unsure';
  spoken: string;
}

export interface SceneView {
  scene: 'shelf' | 'floor' | 'other';
  kinds: string[];
  aisle_hint: string | null;
}

async function postShelf<T>(path: string, payload: unknown): Promise<T> {
  const { url, accessCode } = relayConfig();
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessCode}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { ok: boolean; error?: string } & Partial<T>;
  if (!res.ok || !body.ok) {
    throw new Error(body.error ?? `shelf http ${res.status}`);
  }
  return body as T;
}

export async function outlineShelf(
  image: string,
  mime: string,
  phrase: string,
): Promise<{ outlines: ShelfOutline[]; samMs: number }> {
  return postShelf('/outline', { image, mime, phrase });
}

export async function fetchPackagePhrase(request: string, image: string, mime: string): Promise<string> {
  const body = await postShelf<{ phrase: string }>('/package-phrase', { request, image, mime });
  return body.phrase;
}

export async function readShelfCrops(
  request: string,
  crops: ShelfCrop[],
): Promise<{ reads: ShelfRead[]; readMs: number }> {
  return postShelf('/read-shelf', { request, crops });
}

export async function classifySceneView(request: string, image: string, mime: string): Promise<SceneView> {
  const body = await postShelf<{ scene: SceneView }>('/classify-scene', { request, image, mime });
  return body.scene;
}


