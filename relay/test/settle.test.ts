// A yes stands only on matched evidence: a word that changes the
// product or a different amount is a no, however the label spells
// its decimals or units.
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleConfirm } from '../src/settle.ts';
import type { ConfirmAttrs, ConfirmRead } from '../src/confirm.ts';

const NONE: ConfirmAttrs = { brand: null, product: null, variant: null, size: null };

function settled(asked: Partial<ConfirmAttrs>, read: Partial<ConfirmAttrs>): string {
  const yes: ConfirmRead = {
    verdict: 'yes',
    picture_problem: null,
    asked: { ...NONE, ...asked },
    read: { ...NONE, ...read },
    label_name: 'label',
    unreadable: [],
  };
  return settleConfirm(yes).verdict;
}

test('a word that changes the product is a no, never a yes', () => {
  assert.equal(settled({ product: 'butter', variant: 'salted' }, { product: 'butter', variant: 'unsalted' }), 'no');
  assert.equal(settled({ product: 'cola', variant: 'regular' }, { product: 'cola', variant: 'regular zero sugar' }), 'no');
  assert.equal(settled({ product: 'Coca-Cola' }, { product: 'Coca-Cola Zero' }), 'no');
  assert.equal(settled({ product: 'Coca-Cola Zero' }, { product: 'Coca-Cola' }), 'no');
  assert.equal(settled({ product: 'lait' }, { product: 'lait sans lactose' }), 'no');
  assert.equal(settled({ product: 'حليب' }, { product: 'حليب خالي الدسم' }), 'no');
});

test('a name inside a longer name still matches', () => {
  assert.equal(settled({ brand: 'Masaad', product: 'water' }, { brand: 'Masaad', product: 'mineral water' }), 'yes');
  assert.equal(settled({ brand: 'Taaounia', product: 'Riz' }, { brand: 'El Taaounia', product: 'Riz' }), 'yes');
  assert.equal(settled({ product: 'ماء' }, { product: 'الماء المعدني' }), 'yes');
  assert.equal(settled({ brand: 'CocaCola' }, { brand: 'Coca-Cola' }), 'yes');
});

test('a decimal comma or Arabic decimal sign is part of the amount', () => {
  assert.equal(settled({ product: 'water', size: '1,5 L' }, { product: 'water', size: '1,75 L' }), 'no');
  assert.equal(settled({ product: 'ماء', size: '١٫٥ لتر' }, { product: 'ماء', size: '١٫٧٥ لتر' }), 'no');
  assert.equal(settled({ product: 'water', size: '1.5 L' }, { product: 'water', size: '1,5 L' }), 'yes');
  assert.equal(settled({ product: 'ماء', size: '1.5 L' }, { product: 'ماء', size: '١٫٥ لتر' }), 'yes');
});

test('the same amount in another unit matches, another amount never does', () => {
  assert.equal(settled({ product: 'rice', size: '1 kg' }, { product: 'rice', size: '1000 g' }), 'yes');
  assert.equal(settled({ product: 'water', size: '1.5 L' }, { product: 'water', size: '1500 ml' }), 'yes');
  assert.equal(settled({ product: 'rice', size: '1 kg' }, { product: 'rice', size: '500 g' }), 'no');
  assert.equal(settled({ product: 'water', size: '500 ml' }, { product: 'water', size: '500 g' }), 'no');
});
