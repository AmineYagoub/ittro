// The speech engine underneath say(): one attempt with a time
// budget from the word count, probes that tell a slow engine from
// a dropped line, and one retry. Nothing here knows about the voice
// gate, TalkBack or clips; speech.ts owns those and the generation
// that cancels a line.
import * as Speech from 'expo-speech';
import type { Language } from './theme';
import { logIttro } from './log';

const SPEECH_LOCALE: Record<Language, string> = { en: 'en-US', ar: 'ar-SA', fr: 'fr-FR' };

export function speechBudgetMs(text: string): number {
  const words = text.split(/\s+/).length;
  return 600 + (words / 2.5) * 1000;
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

function speakOnce(text: string, lang: Language, rate: number): Promise<SpeakOutcome> {
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
        rate,
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

async function waitForEngine(text: string, alive: () => boolean): Promise<void> {
  const budgetMs = speechBudgetMs(text);
  const started = Date.now();
  for (;;) {
    if (!alive() || !(await engineSpeaking())) {
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

export async function speakWithRetry(text: string, lang: Language, rate: number, alive: () => boolean): Promise<void> {
  const first = await speakOnce(text, lang, rate);
  if (!alive() || first === 'done' || first === 'stopped') {
    return;
  }
  if (first === 'slow') {
    logIttro('say slow, waiting for the engine');
    await waitForEngine(text, alive);
    return;
  }
  if (first === 'unacked') {
    logIttro('say ended without its callback, carrying on');
    return;
  }
  logIttro(retryLog(first, true));
  void Speech.stop();
  const second = await speakOnce(text, lang, rate);
  if (!alive() || second === 'done' || second === 'stopped') {
    return;
  }
  if (second === 'slow') {
    await waitForEngine(text, alive);
    return;
  }
  if (second === 'unacked') {
    logIttro('say ended without its callback, carrying on');
    return;
  }
  logIttro(retryLog(second, false));
  void Speech.stop();
}
