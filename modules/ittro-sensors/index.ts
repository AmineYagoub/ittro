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
  prepareTrackGrey: (uri: string) => Promise<TrackGrey | null>;
  setHandDelegate: (delegate: string) => boolean;
  takeCameraShot: () => Promise<string | null>;
}

export type HandDelegate = 'cpu' | 'gpu';

export interface HandFrame {
  present: boolean;
  x: number;
  y: number;
  confidence: number;
  handWidth: number;
  detectMs: number;
  frameMs: number;
  frame: number;
  dropped: number;
}

export interface CameraViewProps {
  active: boolean;
  style?: unknown;
  accessible?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  onCameraReady?: () => void;
  onHandFrame?: (event: { nativeEvent: HandFrame }) => void;
  onCameraError?: (event: { nativeEvent: { message: string } }) => void;
}

export interface CameraViewComponent {
  (props: CameraViewProps): null;
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

export interface TrackGrey {
  grey: string;
  gw: number;
  gh: number;
  pw: number;
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

export async function prepareTrackGrey(uri: string): Promise<TrackGrey | null> {
  if (!native) {
    return null;
  }
  try {
    return await native.prepareTrackGrey(uri);
  } catch {
    return null;
  }
}

export function setHandDelegate(delegate: HandDelegate): boolean {
  if (!native) {
    return false;
  }
  try {
    return native.setHandDelegate(delegate);
  } catch {
    return false;
  }
}

export async function takeCameraShot(): Promise<string | null> {
  if (!native) {
    return null;
  }
  try {
    const uri = await native.takeCameraShot();
    return typeof uri === 'string' && uri.length > 0 ? uri : null;
  } catch {
    return null;
  }
}

function loadCameraView(): CameraViewComponent | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native view, absent until prebuild links it
    const core = require('expo-modules-core') as {
      requireNativeViewManager: (module: string) => unknown;
    };
    return core.requireNativeViewManager('IttroSensors') as CameraViewComponent;
  } catch {
    return null;
  }
}

export const IttroCameraView = loadCameraView();

export function validHandFrame(frame: HandFrame): boolean {
  return (
    typeof frame.present === 'boolean' &&
    (!frame.present || (frame.x >= 0 && frame.y >= 0 && frame.confidence >= 0)) &&
    frame.detectMs >= 0 &&
    frame.frameMs >= 0 &&
    frame.frame > 0 &&
    frame.dropped >= 0
  );
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
