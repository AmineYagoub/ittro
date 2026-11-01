// Every word a screen offers works in that state: each chip below
// is heard as its word and must route somewhere, never to the
// missed line. The scripts stand in for Meta; the relay pins the
// words to intents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, startListening } from './driver';
import type { Driver } from './driver';
import {
  DONE_CHIP,
  FIND_ANOTHER_CHIP,
  GUIDE_CHIP,
  HELP_CHIP,
  NO_CHIP,
  READ_AGAIN_CHIP,
  REPEAT_CHIP,
  STOP_CHIP,
  SWITCH_CHIP,
  YES_CHIP,
} from '../src/chips';
import { didntCatch, didntCatchHelp } from '../src/lines';
import { resetStorage } from './stubs.mjs';

const TARGET = {
  id: 7,
  frame: 3,
  box: { x1: 800, y1: 400, x2: 1000, y2: 640, w: 1280, h: 960, confidence: null },
};

function heardMiss(driver: Driver): boolean {
  const last = driver.spoken.at(-1) ?? '';
  return [didntCatch.en, didntCatchHelp.en, didntCatch.ar, didntCatchHelp.ar, didntCatch.fr, didntCatchHelp.fr].includes(last);
}

async function atConfirm(): Promise<Driver> {
  resetStorage();
  const driver = await startListening();
  driver.setUnderstand((input) =>
    input.transcript.includes('Masaad')
      ? answer({ intent: 'request_product', product_text: 'Masaad water' })
      : answer({ intent: 'confirm_yes' }),
  );
  await driver.heard("I'm looking for Masaad water");
  assert.deepEqual(driver.context().lastChips, [YES_CHIP.en, NO_CHIP.en]);
  return driver;
}

async function atAlternative(): Promise<Driver> {
  const driver = await atConfirm();
  await driver.heard('Yes');
  driver.send({ type: 'NOT_HERE', wanted: 'Masaad water', answer: 'No Masaad water on this shelf. I see Masaad juice.', offer: 'Masaad juice', checked: 4, whole: true });
  await driver.flush();
  assert.equal(driver.context().step, 'alternative');
  return driver;
}

async function pickedUp(): Promise<Driver> {
  const driver = await atConfirm();
  await driver.heard('Yes');
  driver.send({ type: 'SHELF_FOUND', product: 'Masaad water', outline: TARGET, matches: 1, kind: 'bottles', position: 'left' });
  await driver.flush();
  driver.send({ type: 'GUIDE_COVERING', proximity: 1, hand: { x: 900, y: 520 } });
  await driver.flush();
  driver.send({ type: 'GUIDE_GOT_IT' });
  await driver.flush();
  assert.equal(driver.confirm(), 'checking');
  return driver;
}

async function atNo(): Promise<Driver> {
  const driver = await pickedUp();
  driver.send({ type: 'CONFIRM_NO', epoch: driver.context().confirmEpoch, label: 'Guedila bottle', crop: 'crop' });
  await driver.flush();
  assert.deepEqual(driver.context().lastChips, [GUIDE_CHIP.en, READ_AGAIN_CHIP.en]);
  assert.match(driver.context().lastLine, /Masaad water is to your right/);
  return driver;
}

async function atYes(): Promise<Driver> {
  const driver = await pickedUp();
  driver.send({ type: 'CONFIRM_YES', epoch: driver.context().confirmEpoch, label: 'Masaad water', crop: 'crop' });
  await driver.flush();
  assert.deepEqual(driver.context().lastChips, [FIND_ANOTHER_CHIP.en, DONE_CHIP.en]);
  return driver;
}

test('welcome offers help', async () => {
  resetStorage();
  const driver = await startListening();
  try {
    assert.deepEqual(driver.context().lastChips, [HELP_CHIP.en]);
    driver.setUnderstand(() => answer({ intent: 'help' }));
    await driver.heard(HELP_CHIP.en);
    assert.equal(heardMiss(driver), false);
    assert.equal(driver.talk(), 'listening');
  } finally {
    driver.stop();
  }
});

test('confirm offers yes and no', async () => {
  const driver = await atConfirm();
  try {
    driver.setUnderstand(() => answer({ intent: 'confirm_yes' }));
    await driver.heard(YES_CHIP.en);
    assert.equal(driver.context().request, 'Masaad water');
  } finally {
    driver.stop();
  }
  const declined = await atConfirm();
  try {
    declined.setUnderstand(() => answer({ intent: 'confirm_no' }));
    await declined.heard(NO_CHIP.en);
    assert.equal(declined.context().step, 'welcome');
    assert.equal(declined.context().pendingRequest, null);
    assert.equal(heardMiss(declined), false);
  } finally {
    declined.stop();
  }
});

test('alternative offers yes and no', async () => {
  const driver = await atAlternative();
  try {
    driver.setUnderstand(() => answer({ intent: 'confirm_yes' }));
    await driver.heard(YES_CHIP.en);
    assert.equal(driver.context().request, 'Masaad juice');
  } finally {
    driver.stop();
  }
  const kept = await atAlternative();
  try {
    kept.setUnderstand(() => answer({ intent: 'confirm_no' }));
    await kept.heard(NO_CHIP.en);
    assert.equal(kept.context().request, 'Masaad water');
    assert.equal(heardMiss(kept), false);
  } finally {
    kept.stop();
  }
});

test('a no offers guide me and read again', async () => {
  const driver = await atNo();
  try {
    driver.setUnderstand(() => answer({ intent: 'guide_me' }));
    await driver.heard(GUIDE_CHIP.en);
    assert.equal(heardMiss(driver), false);
    assert.equal(driver.context().searching, true);
    assert.equal(driver.confirm(), 'idle');
  } finally {
    driver.stop();
  }
  const reread = await atNo();
  try {
    reread.setUnderstand(() => answer({ intent: 'read_again' }));
    await reread.heard(READ_AGAIN_CHIP.en);
    assert.equal(heardMiss(reread), false);
    assert.equal(reread.confirm(), 'checking');
  } finally {
    reread.stop();
  }
});

test('a yes offers find another and done', async () => {
  const driver = await atYes();
  try {
    driver.setUnderstand(() => answer({ intent: 'find_another' }));
    await driver.heard(FIND_ANOTHER_CHIP.en);
    assert.equal(heardMiss(driver), false);
    assert.equal(driver.context().request, null);
  } finally {
    driver.stop();
  }
  const done = await atYes();
  try {
    done.setUnderstand(() => answer({ intent: 'done' }));
    await done.heard(DONE_CHIP.en);
    assert.equal(heardMiss(done), false);
    assert.equal(done.talk(), 'sleeping');
  } finally {
    done.stop();
  }
});

async function atOffer(): Promise<Driver> {
  resetStorage();
  const driver = await startListening();
  driver.setUnderstand((input) =>
    input.transcript.includes('مسعد')
      ? answer({ intent: 'request_product', product_text: 'Masaad water', language_spoken: 'ar' })
      : answer({ intent: 'confirm_yes' }),
  );
  await driver.heard('أنا أبحث عن مسعد');
  assert.deepEqual(driver.context().lastChips, [YES_CHIP.ar, NO_CHIP.ar]);
  return driver;
}

test('a language offer takes yes or no', async () => {
  const driver = await atOffer();
  try {
    driver.setUnderstand(() => answer({ intent: 'confirm_yes' }));
    await driver.heard(YES_CHIP.ar);
    assert.equal(heardMiss(driver), false);
    assert.equal(driver.context().lang, 'ar');
    assert.equal(driver.context().step, 'confirm');
  } finally {
    driver.stop();
  }
  const declined = await atOffer();
  try {
    declined.setUnderstand((input) =>
      input.step === 'translate'
        ? answer({ intent: 'request_product', product_text: 'Masaad water' })
        : answer({ intent: 'confirm_no' }),
    );
    await declined.heard(NO_CHIP.ar);
    assert.equal(heardMiss(declined), false);
    assert.equal(declined.context().lang, 'en');
    assert.equal(declined.context().step, 'confirm');
  } finally {
    declined.stop();
  }
});

test('help offers repeat, switch and stop', async () => {
  resetStorage();
  const helped = await startListening();
  try {
    helped.setUnderstand(() => answer({ intent: 'help' }));
    await helped.heard('help');
    assert.deepEqual(helped.context().lastChips, [REPEAT_CHIP.en, SWITCH_CHIP.en, STOP_CHIP.en]);
    helped.setUnderstand(() => answer({ intent: 'repeat' }));
    await helped.heard(REPEAT_CHIP.en);
    assert.equal(heardMiss(helped), false);
  } finally {
    helped.stop();
  }
  const switched = await startListening();
  try {
    switched.setUnderstand(() => answer({ intent: 'help' }));
    await switched.heard('help');
    switched.setUnderstand(() => answer({ intent: 'speak_language', target_language: 'ar' }));
    await switched.heard(SWITCH_CHIP.en);
    assert.equal(heardMiss(switched), false);
    assert.equal(switched.context().lang, 'ar');
  } finally {
    switched.stop();
  }
  const stopped = await startListening();
  try {
    stopped.setUnderstand(() => answer({ intent: 'help' }));
    await stopped.heard('help');
    stopped.setUnderstand(() => answer({ intent: 'stop' }));
    await stopped.heard(STOP_CHIP.en);
    assert.equal(heardMiss(stopped), false);
    assert.equal(stopped.talk(), 'sleeping');
  } finally {
    stopped.stop();
  }
});
