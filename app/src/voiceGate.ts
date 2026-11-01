// The voice gate: while a line or a clip plays, and for a short
// tail after it, the microphone uplink carries silence instead of
// the room, so nothing Ittro says can come back as a transcript.
// Sounds (ticks, chimes) never close the gate. The gate follows the
// audio the speaker actually plays: the engine's start and end
// callbacks bracket it, a start that arrives after the promise
// resolved re-closes it, and a settle poll holds it while the
// engine still reports speaking. The design's own fallback
// (DESIGN.md, "Interrupting"); the earbud button still interrupts.
import * as Speech from 'expo-speech';

export const VOICE_TAIL_MS = 800;

const SETTLE_POLL_MS = 200;

const SETTLE_CAP_MS = 6000;

const SETTLE_QUIET_POLLS = 2;

let speakingCount = 0;

let voiceTailUntil = 0;

export function voiceGateClosed(now: number = Date.now()): boolean {
  return speakingCount > 0 || now < voiceTailUntil;
}

// How long the gate has been open since Ittro last spoke; 0 while it
// is closed or before Ittro has said anything.
export function voiceQuietMs(now: number = Date.now()): number {
  if (speakingCount > 0 || voiceTailUntil === 0) {
    return 0;
  }
  return Math.max(0, now - voiceTailUntil);
}

async function engineSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch {
    return false;
  }
}

function settleVoice(): void {
  const started = Date.now();
  let quiet = 0;
  const timer = setInterval(() => {
    void engineSpeaking().then((speaking) => {
      if (speaking) {
        quiet = 0;
        voiceTailUntil = Math.max(voiceTailUntil, Date.now() + VOICE_TAIL_MS);
      } else {
        quiet += 1;
      }
      if (quiet >= SETTLE_QUIET_POLLS || Date.now() - started >= SETTLE_CAP_MS) {
        clearInterval(timer);
      }
    });
  }, SETTLE_POLL_MS);
}

export function openVoice(): () => void {
  speakingCount += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    speakingCount -= 1;
    voiceTailUntil = Math.max(voiceTailUntil, Date.now() + VOICE_TAIL_MS);
    settleVoice();
  };
}

export function noteAudioStart(budgetMs: number, now: number = Date.now()): void {
  voiceTailUntil = Math.max(voiceTailUntil, now + budgetMs + VOICE_TAIL_MS);
}

export function noteAudioEnd(now: number = Date.now()): void {
  voiceTailUntil = Math.max(voiceTailUntil, now + VOICE_TAIL_MS);
}
