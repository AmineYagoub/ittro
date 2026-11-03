// In-memory stand-ins for every native module the app imports, served
// by the test loader. Speech and the audio player are controllable so
// tests can hang them; storage is a map cleared between tests.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const designClips = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'design', 'voice', 'clips.json'), 'utf8'),
).clips;

export function sensorsStatus() {
  return { available: false, reason: 'test stub', module: 'IttroSensors' };
}

export function mediaVolume() {
  return null;
}

export function setMediaVolumeFraction() {
  return false;
}

export function thermalStatus() {
  return null;
}

export function memoryStatus() {
  return null;
}

export const audioStreamCalls = [];

export function startAudioStream() {
  audioStreamCalls.push('start');
  return true;
}

export function stopAudioStream() {
  audioStreamCalls.push('stop');
  return true;
}

const audioListeners = new Set();

export function addAudioChunkListener(listener) {
  audioListeners.add(listener);
  return {
    remove() {
      audioListeners.delete(listener);
    },
  };
}

export function emitAudioChunk(chunk, sequence) {
  for (const listener of [...audioListeners]) {
    listener({ chunk, sequence });
  }
}

export function setButtonsActive() {
  return true;
}

export function earbudState() {
  return null;
}

export function addButtonListener() {
  return { remove() {} };
}

export function addEarbudListener() {
  return { remove() {} };
}

export function validButtonPress() {
  return true;
}

export async function prepareShelfPhoto() {
  return null;
}

export async function cropShelfPhoto() {
  return null;
}

export function setHandDelegate() {
  return true;
}

export function cameraPan() {
  return null;
}

export function shotPan() {
  return null;
}

export async function takeCameraShot() {
  return null;
}

export function validHandFrame() {
  return true;
}

export function validTrackPan() {
  return true;
}

export const IttroCameraView = null;

export const Vibration = {
  vibrate() {},
};

export const AccessibilityInfo = {
  isScreenReaderEnabled: async () => false,
  addEventListener: () => ({ remove() {} }),
  announceForAccessibility: () => undefined,
};

export const speechCalls = [];

export const speechStops = [];

let speechHangs = false;

let speechScript = [];

let speechSpeaking = false;

export function setSpeechHang(hang) {
  speechHangs = hang;
}

export function setSpeechScript(outcomes) {
  speechScript = [...outcomes];
}

export function setSpeechSpeaking(speaking) {
  speechSpeaking = speaking;
}

export async function isSpeakingAsync() {
  return speechSpeaking;
}

export function resetSpeech() {
  speechCalls.length = 0;
  speechStops.length = 0;
  voiceQueries.length = 0;
  speechHangs = false;
  speechScript = [];
  speechSpeaking = false;
  audioPlayers.length = 0;
}

export function speak(text, options) {
  speechCalls.push({ text, options });
  const next = speechScript.length > 0 ? speechScript.shift() : speechHangs ? 'hang' : 'ok';
  if (next === 'ok') {
    options.onStart?.();
    options.onDone?.();
  } else if (next === 'error') {
    options.onError?.();
  } else if (next === 'late') {
    options.onDone?.();
    setTimeout(() => options.onStart?.(), 20);
  }
}

export const voiceQueries = [];

export async function getAvailableVoicesAsync() {
  voiceQueries.push(Date.now());
  return [
    { identifier: 'en-1', name: 'English', quality: 'high', language: 'en-US' },
    { identifier: 'ar-1', name: 'Arabic', quality: 'high', language: 'ar-SA' },
  ];
}

export function stop() {
  speechStops.push(Date.now());
}

export const audioPlayers = [];

export function createAudioPlayer() {
  const player = {
    playing: false,
    currentTime: 0,
    duration: 1,
    isLoaded: true,
    listener: null,
    play() {
      player.playing = true;
    },
    pause() {
      player.playing = false;
    },
    remove() {},
    setPlaybackRate() {},
    addListener(event, callback) {
      player.listener = callback;
      return { remove() {} };
    },
    finish() {
      player.playing = false;
      player.listener?.({ didJustFinish: true });
    },
  };
  audioPlayers.push(player);
  return player;
}

const store = new Map();

export function resetStorage() {
  store.clear();
}

const AsyncStorage = {
  getItem: async (key) => store.get(key) ?? null,
  setItem: async (key, value) => {
    store.set(key, value);
  },
};

export default AsyncStorage;

export const cueText = {
  testcue: { en: 'test line', ar: 'سطر اختبار', fr: 'ligne de test' },
  ...Object.fromEntries(designClips.map((cue) => [cue.id, { en: cue.en, ar: cue.ar, fr: cue.fr }])),
};

export const cueClip = {
  testcue: { en: 1, fr: 1 },
};

export const soundAsset = { 'proximity-tick': 1 };

export const StyleSheet = {
  create: (entries) => entries,
};
