// In-memory stand-ins for every native module the app imports, served
// by the test loader. Speech and the audio player are controllable so
// tests can hang them; storage is a map cleared between tests.
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

export function startAudioStream() {
  return true;
}

export function stopAudioStream() {
  return true;
}

export function addAudioChunkListener() {
  return { remove() {} };
}

export async function prepareShelfPhoto() {
  return null;
}

export async function cropShelfPhoto() {
  return null;
}

export const AccessibilityInfo = {
  isScreenReaderEnabled: async () => false,
  addEventListener: () => ({ remove() {} }),
  announceForAccessibility: () => undefined,
};

export const speechCalls = [];

let speechHangs = false;

export function setSpeechHang(hang) {
  speechHangs = hang;
}

export function resetSpeech() {
  speechCalls.length = 0;
  speechHangs = false;
}

export function speak(text, options) {
  speechCalls.push({ text, options });
  if (!speechHangs) {
    options.onDone?.();
  }
}

export function stop() {}

export function createAudioPlayer() {
  return {
    play() {},
    pause() {},
    remove() {},
    setPlaybackRate() {},
    addListener() {
      return { remove() {} };
    },
  };
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
};

export const cueClip = {
  testcue: { en: 1, fr: 1 },
};

export const soundAsset = {};
