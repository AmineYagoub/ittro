// What a question carries (decision record 0001): questions in Darija,
// French and English send the still, requests do not; follow-ups keep
// only what was heard; a repeated question or "no, no" sounds upset;
// the shelf inventory names what the reads saw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor, toPromise } from 'xstate';
import { askHistory, looksLikeQuestion, soundsUpset } from '../src/conversation/askHints';
import { forgetSeen, noteSeen, readName, seenNames } from '../src/shelf/inventory';
import { forgetStills, freshStill, keepStill, setStillSource, takeViewStill } from '../src/shelf/stills';
import { understandAnswer } from '../src/conversation/actors';
import type { ShelfBox } from '../src/relay';

const BOX: ShelfBox = { x1: 0, y1: 0, x2: 10, y2: 10, w: 100, h: 100, confidence: null };

test('questions sound like questions in every language, requests do not', () => {
  for (const said of ['شنو كاين هنا؟', 'واش كاين العسل', 'أيهم أرخص', "qu'est-ce qu'il y a ici", 'combien coûte le riz', 'what is on this shelf', 'is there honey']) {
    assert.equal(looksLikeQuestion(said), true, said);
  }
  for (const said of ['ماء مسعد', 'بغيت العسل', 'ابحث عن غيره', 'I want honey', 'Guedila water', 'نعم']) {
    assert.equal(looksLikeQuestion(said), false, said);
  }
});

test('an interrupted answer is kept to its first sentence, the last four turns only', () => {
  const turns = [1, 2, 3, 4, 5].map((n) => ({ shopper: `q${n}`, ittro: `First ${n}. Second ${n}.`, heard: n !== 5 }));
  const history = askHistory(turns);
  assert.deepEqual(history.map((turn) => turn.shopper), ['q2', 'q3', 'q4', 'q5']);
  assert.equal(history[3]?.ittro, 'First 5.');
  assert.equal(history[0]?.ittro, 'First 2. Second 2.');
});

test('a repeated question or a doubled no sounds upset', () => {
  const turns = [{ shopper: 'شنو كاين هنا؟', ittro: 'على هذا الرف أرز.', heard: true }];
  assert.equal(soundsUpset('شنو كاين هنا', turns), true);
  assert.equal(soundsUpset('لا لا، الآخر', []), true);
  assert.equal(soundsUpset('no no the other one', []), true);
  assert.equal(soundsUpset('واش كاين العسل؟', turns), false);
});

test('the inventory names what the reads saw, the most read first, and ages out', () => {
  forgetSeen();
  noteSeen('Riz blanc', BOX, null, 1000);
  noteSeen('Riz Basmati', BOX, null, 2000);
  noteSeen('riz  BLANC', BOX, null, 3000);
  assert.deepEqual(seenNames(3000, 60000, 5), ['Riz blanc', 'Riz Basmati']);
  assert.deepEqual(seenNames(63000, 60000, 5), ['Riz blanc']);
  assert.equal(readName({ id: 'shelf-t1', brand_text: null, size_text: null, verdict: 'unsure', spoken: 'unreadable' }), null);
  assert.equal(readName({ id: 'shelf-t1', brand_text: 'Medina', size_text: null, verdict: 'no', spoken: 'Medina honey' }), 'Medina honey');
  forgetSeen();
});

test('a still is fresh for a while, and the camera gives one when none is', async () => {
  forgetStills();
  keepStill({ image: 'a', mime: 'image/jpeg', w: 4, h: 4, at: 1000 });
  assert.equal(freshStill(5000, 5000)?.image, 'a');
  assert.equal(freshStill(7000, 5000), null);
  setStillSource(async () => ({ image: 'b', mime: 'image/jpeg', w: 4, h: 4, at: 7000 }));
  assert.equal((await takeViewStill(7000, 5000))?.image, 'b');
  assert.equal(freshStill(7500, 5000)?.image, 'b');
  setStillSource(null);
  forgetStills();
});

test('a question with a fresh still sends it and its hints, and is never cached', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body) as Record<string, unknown>);
    const view = { answer: 'على هذا الرف أرز أبيض.', offer: null, unreadable: [] };
    return new Response(JSON.stringify({ ok: true, answer: { intent: 'ask_view', language_spoken: 'ar', product_text: null, items: null, detail: null, target_language: null, helper_name: null, question: 'شنو كاين', view } }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    keepStill({ image: 'still', mime: 'image/jpeg', w: 4, h: 4, at: Date.now() });
    const input = {
      transcript: 'شنو كاين هنا؟',
      lang: 'ar' as const,
      step: 'welcome' as const,
      pendingQuestion: null,
      pendingRequest: null,
      lastLine: '',
      ask: { withStill: true, history: [], inventory: ['Riz blanc'], upset: false, brief: false },
    };
    const first = await toPromise(createActor(understandAnswer, { input }).start());
    await toPromise(createActor(understandAnswer, { input }).start());
    assert.equal(first.view?.answer, 'على هذا الرف أرز أبيض.');
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0]?.['image'], 'still');
    assert.deepEqual(bodies[0]?.['inventory'], ['Riz blanc']);
  } finally {
    globalThis.fetch = real;
    forgetStills();
  }
});
