// Ittro's single voice. TalkBack on: everything goes through the screen
// reader's announcements. TalkBack off: expo-speech and recorded clips.
// One line cancels the last, so two voices never talk at once.
import { AccessibilityInfo } from 'react-native';
import * as Speech from 'expo-speech';
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import type { Language, SoundName } from './theme';
import { soundFile } from './theme';
import { cueClip, cueText } from './voiceClips';
import { soundAsset } from './soundBank';
import { logIttro } from './log';
import { speakWithRetry, speechBudgetMs } from './speechEngine';
import { openVoice } from './voiceGate';

const CLIP_TIMEOUT_MS = 8000;

const CLIP_GRACE_MS = 400;

const CLIP_POLL_MS = 200;

// EXPO_PUBLIC_ENGINE_CUES=on speaks the English and French cues in the
// picked engine voice, as Arabic is, to compare with the MMS clips.
const ENGINE_CUES = process.env['EXPO_PUBLIC_ENGINE_CUES'] === 'on';

let generation = 0;
let talkBack = false;
let activePlayer: AudioPlayer | null = null;
let speechRate = 1;

export async function initVoice(): Promise<void> {
  talkBack = await AccessibilityInfo.isScreenReaderEnabled();
  AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
    talkBack = enabled;
    stopVoice();
  });
}

export function setSpeechRate(rate: number): void {
  speechRate = Math.min(2, Math.max(0.5, rate));
}

export function stopVoice(): void {
  generation += 1;
  void Speech.stop();
  const player = activePlayer;
  activePlayer = null;
  if (player) {
    try {
      player.pause();
    } catch {
      // Already gone; the next line owns the voice now.
    }
    player.remove();
  }
}

function alive(g: number): boolean {
  return g === generation;
}

function waitEstimate(text: string, g: number): Promise<void> {
  const budgetMs = speechBudgetMs(text);
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = (): void => {
      if (!alive(g) || Date.now() - started >= budgetMs) {
        resolve();
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

export async function say(text: string, lang: Language): Promise<void> {
  const g = ++generation;
  stopPlayer();
  void Speech.stop();
  const release = openVoice();
  try {
    if (talkBack) {
      AccessibilityInfo.announceForAccessibility(text);
      await waitEstimate(text, g);
      return;
    }
    await speakWithRetry(text, lang, speechRate, () => alive(g));
  } finally {
    release();
  }
}

function stopPlayer(): void {
  const player = activePlayer;
  activePlayer = null;
  if (player) {
    try {
      player.pause();
    } catch {
      // Already gone.
    }
    player.remove();
  }
}

function playFile(source: unknown, rate: number, voice: boolean): Promise<void> {
  const g = ++generation;
  stopPlayer();
  const release = voice ? openVoice() : null;
  let player: AudioPlayer;
  try {
    player = createAudioPlayer(source as number);
  } catch {
    release?.();
    return Promise.resolve();
  }
  activePlayer = player;
  try {
    player.setPlaybackRate(rate);
    player.play();
  } catch {
    activePlayer = null;
    try {
      player.remove();
    } catch {
      // Nothing plays; the line still shows.
    }
    release?.();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const started = Date.now();
    const finish = (): void => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      subscription.remove();
      if (activePlayer === player) {
        activePlayer = null;
      }
      player.remove();
      release?.();
      resolve();
    };
    const timer = setTimeout(() => {
      logIttro('clip timed out, carrying on');
      finish();
    }, CLIP_TIMEOUT_MS);
    const poll = setInterval(() => {
      if (Date.now() - started < CLIP_GRACE_MS) {
        return;
      }
      let ended = false;
      try {
        ended = !player.playing || (player.duration > 0 && player.currentTime >= player.duration);
      } catch {
        ended = false;
      }
      if (ended || !alive(g)) {
        finish();
      }
    }, CLIP_POLL_MS);
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish || !alive(g)) {
        finish();
      }
    });
  });
}

export function sayClip(id: string, lang: Language): Promise<void> {
  const cue = cueText[id];
  if (!cue) {
    return Promise.resolve();
  }
  if (lang === 'ar' || talkBack || ENGINE_CUES) {
    return say(cue[lang], lang);
  }
  const clip = cueClip[id]?.[lang];
  if (!clip) {
    return say(cue[lang], lang);
  }
  return playFile(clip, speechRate, true);
}

export function playSound(name: SoundName): void {
  const stem = soundFile[name].replace(/\.wav$/, '');
  const asset = (soundAsset as Record<string, unknown>)[stem];
  if (asset) {
    void playFile(asset, 1, false);
  }
}
