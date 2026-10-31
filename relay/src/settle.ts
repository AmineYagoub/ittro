// Evidence behind a yes: the model sometimes says yes while its
// own read attributes are null or contradict the request. Settle
// runs after the schema gate: a contradiction becomes a no, a
// missing attribute becomes unsure listing it, and only a fully
// matched yes stays a yes. Sizes compare by number and unit, so
// "1.5 L" and "1.5 litres" match while "1 kg" and "500 g" do not.
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

const UNIT_ALIASES: Record<string, string[]> = {
  l: ['l', 'lt', 'litre', 'liter', 'litres', 'liters', 'لتر'],
  ml: ['ml', 'مل'],
  cl: ['cl'],
  g: ['g', 'gr', 'gram', 'grams', 'غرام', 'غ'],
  kg: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms', 'كيلو', 'كغ'],
};

function sizeParts(text: string): { digits: string; unit: string } {
  const folded = foldDigits(foldArabic(text.toLowerCase()));
  const digits = folded.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] ?? '';
  const unit = folded.replace(/[^a-z\u0621-\u064a]/g, '');
  return { digits, unit };
}

function sameUnit(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  return Object.values(UNIT_ALIASES).some((aliases) => aliases.includes(left) && aliases.includes(right));
}

function sizeMatches(asked: string, read: string): boolean {
  const want = sizeParts(asked);
  const got = sizeParts(read);
  if (!want.digits || !got.digits) {
    return norm(asked) === norm(read);
  }
  if (want.digits !== got.digits) {
    return false;
  }
  return !want.unit || !got.unit || sameUnit(want.unit, got.unit);
}

// Words match when one holds the other: "water" and "mineral water",
// "Masaad" and "Masaad water" name the same thing.
function wordsMatch(asked: string, read: string): boolean {
  const want = norm(asked);
  const got = norm(read);
  if (want === got) {
    return true;
  }
  return want.length >= 2 && got.length >= 2 && (want.includes(got) || got.includes(want));
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
