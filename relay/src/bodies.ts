// Shared shapes of the relay's photo routes: the JSON bodies the
// phone posts and the field readers that reject anything but a
// non-empty string before Meta is ever called.
export interface OutlineBody {
  image?: unknown;
  mime?: unknown;
  phrase?: unknown;
  w?: unknown;
  h?: unknown;
}

export interface PhraseBody {
  request?: unknown;
  image?: unknown;
  mime?: unknown;
}

export interface ReadBody {
  request?: unknown;
  crops?: unknown;
}

export function textField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function mimeField(value: unknown): string {
  return value === 'image/png' ? 'image/png' : 'image/jpeg';
}
