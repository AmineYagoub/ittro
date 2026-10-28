// One-shot microphone listening: capture a short clip with the local
// native module and send it to the relay, which calls Meta Voice
// Transcribe. Understanding sentences is the relay's job.
import * as FileSystem from 'expo-file-system';
import { startAudioCapture, stopAudioCapture } from 'ittro-sensors';
import { transcribeClip } from './relay';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listenOnce(language: string, keywords: string[], durationMs: number): Promise<string> {
  if (!startAudioCapture()) {
    return '';
  }
  await sleep(durationMs);
  const path = stopAudioCapture();
  if (!path) {
    return '';
  }
  let base64 = '';
  try {
    base64 = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return '';
  }
  try {
    return await transcribeClip(base64, language, keywords, durationMs / 1000);
  } catch {
    return '';
  }
}
