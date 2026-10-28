// Shelf verdict decisions: which read is the product, which is a
// close alternative, and how the package kind is named aloud. A close
// match shares a real word with the request; sizes never match, since
// a different size is the point of the alternative.
import type { Language } from '../theme';
import type { ShelfOutline, ShelfRead } from '../relay';

function words(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 3)
    .filter((word) => !/\d/.test(word));
}

export function findCloseMatch(request: string, reads: ShelfRead[]): string | null {
  const wanted = new Set(words(request));
  if (wanted.size === 0) {
    return null;
  }
  for (const read of reads) {
    if (read.verdict !== 'no') {
      continue;
    }
    const names = [read.spoken, read.brand_text ?? '', read.size_text ?? ''].join(' ');
    if (words(names).some((word) => wanted.has(word))) {
      return read.spoken;
    }
  }
  return null;
}

export function aisleFallback(lang: Language): string {
  if (lang === 'ar') {
    return 'القسم المناسب';
  }
  if (lang === 'fr') {
    return 'le bon rayon';
  }
  return 'the right aisle';
}

export function packageKind(phrase: string, lang: Language): string {
  if (lang === 'ar') {
    return 'منتجات';
  }
  if (lang === 'fr') {
    return 'produits';
  }
  const last = phrase.trim().split(/\s+/).pop() ?? 'products';
  return `${last}s`;
}

export function outlineSignature(outlines: ShelfOutline[]): string {
  return outlines
    .map((outline) => {
      const box = outline.box;
      const round = (value: number): number => Math.round(value / 20) * 20;
      return `${outline.id}:${round(box.x1)},${round(box.y1)},${round(box.x2)},${round(box.y2)}`;
    })
    .sort()
    .join('|');
}
