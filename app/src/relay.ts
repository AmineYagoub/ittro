import Constants from 'expo-constants';

export interface RelayConfig {
  url: string;
  accessCode: string;
}

export function relayConfig(): RelayConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return {
    url: typeof extra['relayUrl'] === 'string' ? extra['relayUrl'] : 'https://ittro.djazair.dev',
    accessCode: typeof extra['accessCode'] === 'string' ? extra['accessCode'] : '',
  };
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
