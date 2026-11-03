// Voice A: each language speaks with its most natural installed voice,
// an Algerian or Maghreb one first for Arabic, and a voice that fails
// goes back to the phone's default (decision record 0001).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dropVoice, keepVoice, pickVoice, pickedVoice, voiceDecided, voicePending } from '../src/voicePick';
import type { InstalledVoice } from '../src/voicePick';

function voice(identifier: string, language: string, quality = 'Default'): InstalledVoice {
  return { identifier, name: identifier, quality, language };
}

const PHONE = [
  voice('ar-xa-x-arz-local', 'ar'),
  voice('ar-xa-x-arc-network', 'ar'),
  voice('en-us-x-tpf-local', 'en-US'),
  voice('en-us-x-iol-network', 'en-US', 'Enhanced'),
  voice('fr-fr-x-frc-local', 'fr-FR'),
];

test('the network or enhanced voice wins in its language', () => {
  assert.equal(pickVoice(PHONE, 'ar')?.identifier, 'ar-xa-x-arc-network');
  assert.equal(pickVoice(PHONE, 'en')?.identifier, 'en-us-x-iol-network');
});

test('an Algerian voice beats a network voice from elsewhere', () => {
  assert.equal(pickVoice([...PHONE, voice('ar-dz-x-local', 'ar-DZ')], 'ar')?.identifier, 'ar-dz-x-local');
});

test('with only plain voices the phone keeps its default', () => {
  assert.equal(pickVoice(PHONE, 'fr'), null);
  assert.equal(pickVoice([], 'ar'), null);
});

test('a picked voice that failed is dropped once', () => {
  keepVoice('ar', pickVoice(PHONE, 'ar'));
  assert.equal(pickedVoice('ar'), 'ar-xa-x-arc-network');
  assert.equal(dropVoice('ar'), true);
  assert.equal(pickedVoice('ar'), undefined);
  assert.equal(dropVoice('ar'), false);
});

test('English prefers a male US voice, like the MMS cue clips (t45–t47)', () => {
  const phone = [
    voice('en-in-x-end-network', 'en-IN', 'Enhanced'),
    voice('en-us-x-tpf-network', 'en-US', 'Enhanced'),
    voice('en-us-x-iom-network', 'en-US', 'Enhanced'),
  ];
  assert.equal(pickVoice(phone, 'en')?.identifier, 'en-us-x-iom-network');
  assert.equal(pickVoice(phone.slice(0, 2), 'en')?.identifier, 'en-us-x-tpf-network');
});

test('a line waits while the voice is being picked, then speaks with it (t50)', () => {
  voicePending('fr', true);
  assert.equal(voiceDecided('fr'), false);
  keepVoice('fr', voice('fr-fr-x-frd-network', 'fr-FR', 'Enhanced'));
  assert.equal(voiceDecided('fr'), true);
  assert.equal(pickedVoice('fr'), 'fr-fr-x-frd-network');
});
