// The "I see N products" line agrees with its count in every language
// (t6 said "أرى 1 منتجات").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readingLine } from '../src/shelf/searchLines';
import { severalPrefix } from '../src/guide/lines';

test('one product is singular in every language', () => {
  assert.equal(readingLine(1, 'منتجات', 'ar'), 'أرى منتجًا واحدًا. أقرأ ملصقه. ثبت الهاتف.');
  assert.equal(readingLine(1, 'bottles', 'en'), 'I see one bottle. Reading its label. Hold the phone steady.');
  assert.equal(readingLine(1, 'produits', 'fr'), 'Je vois 1 produit. Je lis son étiquette. Tenez le téléphone immobile.');
});

test('Arabic counts take the dual, the plural and the singular accusative', () => {
  assert.equal(readingLine(2, 'منتجات', 'ar'), 'أرى منتجين. أقرأ ملصقاتها. ثبت الهاتف.');
  assert.equal(readingLine(4, 'منتجات', 'ar'), 'أرى 4 منتجات. أقرأ ملصقاتها. ثبت الهاتف.');
  assert.equal(readingLine(12, 'منتجات', 'ar'), 'أرى 12 منتجًا. أقرأ ملصقاتها. ثبت الهاتف.');
});

test('English keeps the plural from two up', () => {
  assert.equal(readingLine(3, 'bottles', 'en'), 'I see three bottles. Reading their labels. Hold the phone steady.');
});

test('several matches count in Arabic words and leave the way to the hand cue (t20)', () => {
  assert.equal(severalPrefix(2, 'قديلة', 'منتجات', 'ar'), 'أرى منتجين من قديلة. أرشدك إلى أقربهما.');
  assert.equal(severalPrefix(3, 'مسعد', 'منتجات', 'ar'), 'أرى 3 منتجات من مسعد. أرشدك إلى أقربها.');
  assert.equal(severalPrefix(2, 'Guedila', 'produits', 'fr'), 'Je vois 2 produits Guedila. Je vous guide vers le plus proche.');
});
