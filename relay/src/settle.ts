// Evidence behind a yes: the model sometimes says yes while its
// own read attributes are null or contradict the request. Settle
// runs after the schema gate: a contradiction becomes a no, a
// missing attribute becomes unsure listing it, and only a fully
// matched yes stays a yes. Names match word by word, so "Masaad"
// and "Masaad water" match while "salted" and "unsalted", or "Cola"
// and "Cola Zero", do not. Sizes compare by amount, so "1,5 L",
// "1.5 litres" and "1500 ml" match while "1 kg" and "500 g" do not.
import type { ConfirmAttr, ConfirmRead } from './confirm.ts';

const ATTRS: ConfirmAttr[] = ['brand', 'product', 'variant', 'size'];

function foldArabic(text: string): string {
  return text.replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا');
}

function foldDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

function norm(text: string): string {
  return foldArabic(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// Each unit as its base (g or ml) and how many of the base it holds.
const UNITS: Record<string, [string, number]> = {
  l: ['ml', 1000], lt: ['ml', 1000], litre: ['ml', 1000], liter: ['ml', 1000], litres: ['ml', 1000], liters: ['ml', 1000], لتر: ['ml', 1000],
  cl: ['ml', 10],
  ml: ['ml', 1], مل: ['ml', 1],
  g: ['g', 1], gr: ['g', 1], gram: ['g', 1], grams: ['g', 1], غرام: ['g', 1], غ: ['g', 1],
  kg: ['g', 1000], kilo: ['g', 1000], kilos: ['g', 1000], kilogram: ['g', 1000], kilograms: ['g', 1000], كيلو: ['g', 1000], كغ: ['g', 1000],
};

// A decimal comma ("1,5 L") and the Arabic decimal sign ("١٫٥") are
// decimal points, never the end of the number.
function sizeParts(text: string): { amount: number | null; unit: string } {
  const decimals = text.toLowerCase().replace(/([0-9٠-٩])[,٫]([0-9٠-٩])/g, '$1.$2');
  const folded = foldDigits(foldArabic(decimals));
  const digits = folded.match(/[0-9]+(?:\.[0-9]+)?/)?.[0];
  const unit = folded.replace(/[^a-z\u0621-\u064a]/g, '');
  return { amount: digits === undefined ? null : Number(digits), unit };
}

function sizeMatches(asked: string, read: string): boolean {
  const want = sizeParts(asked);
  const got = sizeParts(read);
  if (want.amount === null || got.amount === null) {
    return norm(asked) === norm(read);
  }
  if (!want.unit || !got.unit) {
    return want.amount === got.amount;
  }
  const wantUnit = UNITS[want.unit];
  const gotUnit = UNITS[got.unit];
  if (!wantUnit || !gotUnit) {
    return want.unit === got.unit && want.amount === got.amount;
  }
  return wantUnit[0] === gotUnit[0] && Math.abs(want.amount * wantUnit[1] - got.amount * gotUnit[1]) < 1e-6;
}

// Words that turn a name into another product: "Cola Zero" is not
// "Cola", and "lait sans lactose" is not "lait".
const CHANGERS = new Set([
  'zero', 'light', 'lite', 'diet', 'free', 'sans', 'without', 'no', 'non', 'low', 'reduced',
  'decaf', 'decaffeinated', 'skimmed', 'écrémé', 'allégé', 'بدون', 'خالي', 'لايت', 'منزوع',
]);

// Arabic "ال" is the article, so "الماء" is "ماء".
function words(text: string): string[] {
  return foldArabic(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .map((word) => (word.length > 3 && word.startsWith('ال') ? word.slice(2) : word));
}

// Names match when every word of one is a word of the other and the
// extra words never change what the product is: "water" and
// "mineral water" name the same thing, "salted" and "unsalted" never.
function wordsMatch(asked: string, read: string): boolean {
  if (norm(asked) === norm(read)) {
    return true;
  }
  const want = words(asked);
  const got = words(read);
  if (want.length === 0 || got.length === 0) {
    return false;
  }
  const [short, long] = want.length <= got.length ? [want, got] : [got, want];
  if (!short.every((word) => long.includes(word))) {
    return false;
  }
  return !long.some((word) => !short.includes(word) && CHANGERS.has(word));
}

function attrMatches(attr: ConfirmAttr, asked: string, read: string): boolean {
  if (attr === 'size') {
    return sizeMatches(asked, read);
  }
  return wordsMatch(asked, read);
}

export function settleConfirm(read: ConfirmRead): ConfirmRead {
  if (read.verdict !== 'yes') {
    return read;
  }
  const missing: ConfirmAttr[] = [];
  for (const attr of ATTRS) {
    const asked = read.asked[attr];
    const got = read.read[attr];
    if (asked === null) {
      continue;
    }
    if (got === null) {
      missing.push(attr);
      continue;
    }
    if (!attrMatches(attr, asked, got)) {
      return { ...read, verdict: 'no' };
    }
  }
  if (missing.length > 0 || ATTRS.every((attr) => read.asked[attr] === null)) {
    return { ...read, verdict: 'unsure', unreadable: missing };
  }
  return read;
}
