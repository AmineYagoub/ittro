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

const SPEECH_LOCALE: Record<Language, string> = { en: 'en-US', ar: 'ar-SA', fr: 'fr-FR' };

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
  const words = text.split(/\s+/).length;
  const budgetMs = 600 + (words / 2.5) * 1000;
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

export function say(text: string, lang: Language): Promise<void> {
  const g = ++generation;
  stopPlayer();
  void Speech.stop();
  if (talkBack) {
    AccessibilityInfo.announceForAccessibility(text);
    return waitEstimate(text, g);
  }
  return new Promise((resolve) => {
    Speech.speak(text, {
      language: SPEECH_LOCALE[lang],
      rate: speechRate,
      onDone: () => {
        if (alive(g)) {
          resolve();
        }
      },
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
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

function playFile(source: unknown, rate: number): Promise<void> {
  const g = ++generation;
  stopPlayer();
  let player: AudioPlayer;
  try {
    player = createAudioPlayer(source as number);
  } catch {
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
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish || !alive(g)) {
        subscription.remove();
        if (activePlayer === player) {
          activePlayer = null;
        }
        player.remove();
        resolve();
      }
    });
  });
}

export function sayClip(id: string, lang: Language): Promise<void> {
  const cue = cueText[id];
  if (!cue) {
    return Promise.resolve();
  }
  if (lang === 'ar' || talkBack) {
    return say(cue[lang], lang);
  }
  const clip = cueClip[id]?.[lang];
  if (!clip) {
    return say(cue[lang], lang);
  }
  return playFile(clip, speechRate);
}

export function playSound(name: SoundName): void {
  const stem = soundFile[name].replace(/\.wav$/, '');
  const asset = (soundAsset as Record<string, unknown>)[stem];
  if (asset) {
    void playFile(asset, 1);
  }
}
