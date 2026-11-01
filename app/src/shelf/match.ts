// Shelf naming helpers: how the package kind is named aloud, and a
// signature that tells a new set of outlines from the last one. What to offer when the
// product is not here is Muse Spark's call (shelf/loopSweep.ts): word
// overlap never matched across scripts.
import type { Language } from '../theme';
import type { ShelfOutline } from '../relay';

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
