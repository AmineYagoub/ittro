// JS side of the ittro-sensors native module. When the module is not
// linked yet (Expo Go, or before prebuild), every call reports
// unavailable instead of crashing.

interface SensorsStatus {
  available: boolean;
  reason?: string;
  module?: string;
}

interface VolumeState {
  volume: number;
  max: number;
}

interface SensorsNative {
  getStatus: () => SensorsStatus;
  getMediaVolume: () => VolumeState;
  setMediaVolume: (fraction: number) => boolean;
  getThermalStatus: () => number;
  startAudioCapture: () => boolean;
  stopAudioCapture: () => string | null;
  startAudioStream: () => boolean;
  stopAudioStream: () => boolean;
}

export interface AudioChunk {
  chunk: string;
  sequence: number;
}

function loadNative(): SensorsNative | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, absent until prebuild links it
    const modules = require('expo-modules-core') as {
      requireOptionalNativeModule: (name: string) => SensorsNative | null;
    };
    return modules.requireOptionalNativeModule('IttroSensors');
  } catch {
    return null;
  }
}

const native: SensorsNative | null = loadNative();

export function sensorsStatus(): SensorsStatus {
  if (native) {
    return native.getStatus();
  }
  return { available: false, reason: 'native module not wired yet' };
}

export function mediaVolume(): VolumeState | null {
  if (!native) {
    return null;
  }
  const state = native.getMediaVolume();
  if (state.volume < 0 || state.max <= 0) {
    return null;
  }
  return state;
}

export function setMediaVolumeFraction(fraction: number): boolean {
  if (!native) {
    return false;
  }
  return native.setMediaVolume(fraction);
}

export function thermalStatus(): number | null {
  if (!native) {
    return null;
  }
  const status = native.getThermalStatus();
  return status < 0 ? null : status;
}

export function startAudioStream(): boolean {
  if (!native) {
    return false;
  }
  try {
    return native.startAudioStream();
  } catch {
    return false;
  }
}

export function stopAudioStream(): boolean {
  if (!native) {
    return false;
  }
  try {
    return native.stopAudioStream();
  } catch {
    return false;
  }
}

export function addAudioChunkListener(listener: (chunk: AudioChunk) => void): { remove: () => void } | null {
  if (!native) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, absent until prebuild links it
    const core = require('expo-modules-core') as {
      EventEmitter: new (module: object) => { addListener: (event: string, listener: (chunk: AudioChunk) => void) => { remove: () => void } };
    };
    return new core.EventEmitter(native).addListener('onAudioChunk', listener);
  } catch {
    return null;
  }
}

export function startAudioCapture(): boolean {
  if (!native) {
    return false;
  }
  try {
    return native.startAudioCapture();
  } catch {
    return false;
  }
}


export function stopAudioCapture(): string | null {
  if (!native) {
    return null;
  }
  try {
    return native.stopAudioCapture();
  } catch {
    return null;
  }
}
