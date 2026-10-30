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

const SPEECH_LOCALE: Record<Language, string> = { en: 'en-US', ar: 'ar-SA', fr: 'fr-FR' };

const CLIP_TIMEOUT_MS = 8000;

const CLIP_GRACE_MS = 400;

const CLIP_POLL_MS = 200;

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

function speechBudgetMs(text: string): number {
  const words = text.split(/\s+/).length;
  return 600 + (words / 2.5) * 1000;
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

type SpeakOutcome = 'done' | 'stopped' | 'error' | 'slow' | 'unacked' | 'dropped';

async function engineSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch {
    return false;
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speakOnce(text: string, lang: Language): Promise<SpeakOutcome> {
  return new Promise((resolve) => {
    let done = false;
    let heardEngine = false;
    const begun = Date.now();
    const finish = (outcome: SpeakOutcome): void => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        clearInterval(probe);
        resolve(outcome);
      }
    };
    const probe = setInterval(() => {
      void engineSpeaking().then((speaking) => {
        heardEngine = heardEngine || speaking;
      });
    }, 200);
    const timer = setTimeout(() => {
      void engineSpeaking().then((speaking) => {
        if (speaking) {
          finish('slow');
        } else if (heardEngine) {
          finish('unacked');
        } else {
          finish('dropped');
        }
      });
    }, speechBudgetMs(text));
    try {
      Speech.speak(text, {
        language: SPEECH_LOCALE[lang],
        rate: speechRate,
        onStart: () => logIttro(`say started ${Date.now() - begun}ms`),
        onDone: () => finish('done'),
        onStopped: () => finish('stopped'),
        onError: () => finish('error'),
      });
    } catch {
      finish('error');
    }
  });
}

async function waitForEngine(text: string, g: number): Promise<void> {
  const budgetMs = speechBudgetMs(text);
  const started = Date.now();
  for (;;) {
    if (!alive(g) || !(await engineSpeaking())) {
      return;
    }
    if (Date.now() - started >= budgetMs) {
      void Speech.stop();
      return;
    }
    await sleepMs(200);
  }
}

function retryLog(outcome: 'error' | 'dropped', again: boolean): string {
  if (outcome === 'dropped') {
    return again ? 'say dropped, saying again' : 'say dropped twice, carrying on';
  }
  return again ? 'say failed, saying again' : 'say failed twice, carrying on';
}

async function speakWithRetry(text: string, lang: Language, g: number): Promise<void> {
  const first = await speakOnce(text, lang);
  if (!alive(g) || first === 'done' || first === 'stopped') {
    return;
  }
  if (first === 'slow') {
    logIttro('say slow, waiting for the engine');
    await waitForEngine(text, g);
    return;
  }
  if (first === 'unacked') {
    logIttro('say ended without its callback, carrying on');
    return;
  }
  logIttro(retryLog(first, true));
  void Speech.stop();
  const second = await speakOnce(text, lang);
  if (!alive(g) || second === 'done' || second === 'stopped') {
    return;
  }
  if (second === 'slow') {
    await waitForEngine(text, g);
    return;
  }
  if (second === 'unacked') {
    logIttro('say ended without its callback, carrying on');
    return;
  }
  logIttro(retryLog(second, false));
  void Speech.stop();
}

export function say(text: string, lang: Language): Promise<void> {
  const g = ++generation;
  stopPlayer();
  void Speech.stop();
  if (talkBack) {
    AccessibilityInfo.announceForAccessibility(text);
    return waitEstimate(text, g);
  }
  return speakWithRetry(text, lang, g);
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
