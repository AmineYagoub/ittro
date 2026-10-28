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



interface TranscribeAnswer {
  ok: boolean;
  text?: string;
  error?: string;
}

export async function transcribeClip(base64: string, language: string, keywords: string[], seconds: number): Promise<string> {
  const { url, accessCode } = relayConfig();
  const res = await fetch(`${url}/transcribe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessCode}`,
    },
    body: JSON.stringify({ audio: base64, language, keywords, seconds }),
  });
  const body = (await res.json()) as TranscribeAnswer;
  if (!res.ok || !body.ok || typeof body.text !== 'string') {
    throw new Error(body.error ?? `transcribe http ${res.status}`);
  }
  return body.text;
}
