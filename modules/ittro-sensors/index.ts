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
  startAudioStream: () => boolean;
  stopAudioStream: () => boolean;
  prepareShelfPhoto: (uri: string) => Promise<ShelfPhoto | null>;
  cropShelfPhoto: (photo: string, x1: number, y1: number, x2: number, y2: number) => Promise<ShelfCrop | null>;
}

export interface ShelfPhoto {
  photo: string;
  w: number;
  h: number;
  grey: string;
  gw: number;
  gh: number;
}

export interface ShelfCrop {
  image: string;
  mime: string;
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

export async function prepareShelfPhoto(uri: string): Promise<ShelfPhoto | null> {
  if (!native) {
    return null;
  }
  try {
    return await native.prepareShelfPhoto(uri);
  } catch {
    return null;
  }
}

export async function cropShelfPhoto(
  photo: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Promise<ShelfCrop | null> {
  if (!native) {
    return null;
  }
  try {
    return await native.cropShelfPhoto(photo, x1, y1, x2, y2);
  } catch {
    return null;
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
