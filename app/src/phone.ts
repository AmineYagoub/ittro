// Real-phone rules from DESIGN.md: volume, wake lock, battery and heat,
// and pausing when the shopper leaves. Volume and heat come from the
// local native module; Total silence about them is a bug.
import { AppState, Vibration } from 'react-native';
import * as Battery from 'expo-battery';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { mediaVolume, sensorsStatus, setMediaVolumeFraction, thermalStatus } from 'ittro-sensors';
import { haptics, speech } from './theme';

let batteryWarned = false;
let heatWarned = false;

function buzz(pattern: readonly number[]): void {
  Vibration.vibrate([...pattern]);
}

export async function preparePhone(): Promise<void> {
  if (__DEV__) console.log(`[ittro-debug] sensors ${JSON.stringify(sensorsStatus())}`);
  const state = mediaVolume();
  if (__DEV__) console.log(`[ittro-debug] volume ${JSON.stringify(state)}`);
  if (state && state.volume / state.max < speech.lowVolumeThreshold) {
    if (__DEV__) console.log(`[ittro-debug] raising to ${speech.raisedVolume}`);
    if (setMediaVolumeFraction(speech.raisedVolume)) {
      buzz(haptics.startVolumeBuzz);
    }
  }
  activateKeepAwakeAsync();
}

export function restPhone(): void {
  deactivateKeepAwake();
}

export async function batteryLow(): Promise<boolean> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 && level * 100 <= speech.lowBatteryPercent;
  } catch {
    return false;
  }
}

export function phoneHot(): boolean {
  const status = thermalStatus();
  return status !== null && status >= 2;
}

export async function checkPhoneOnce(
  onBattery: () => void,
  onHeat: () => void,
): Promise<void> {
  if (!batteryWarned && (await batteryLow())) {
    batteryWarned = true;
    onBattery();
  }
  if (!heatWarned && phoneHot()) {
    heatWarned = true;
    onHeat();
  }
}

export function watchAppState(onPause: () => void, onResume: () => void): () => void {
  let foreground = true;
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && !foreground) {
      foreground = true;
      onResume();
    } else if (state !== 'active' && foreground) {
      foreground = false;
      onPause();
    }
  });
  return (): void => subscription.remove();
}
