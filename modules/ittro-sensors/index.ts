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

export { addAudioChunkListener, addButtonListener, addEarbudListener, validButtonPress } from './events';
export type { AudioChunk, ButtonGesture, ButtonPress, EarbudState, ListenerHandle } from './events';
import type { EarbudState } from './events';

interface SensorsNative {
  getStatus: () => SensorsStatus;
  getMediaVolume: () => VolumeState;
  setMediaVolume: (fraction: number) => boolean;
  getThermalStatus: () => number;
  getMemoryStatus: () => { availMb: number; totalMb: number };
  setButtonsActive: (active: boolean) => boolean;
  getEarbudState: () => EarbudState;
  startAudioStream: () => boolean;
  stopAudioStream: () => boolean;
  prepareShelfPhoto: (uri: string) => Promise<ShelfPhoto | null>;
  cropShelfPhoto: (photo: string, x1: number, y1: number, x2: number, y2: number) => Promise<ShelfCrop | null>;
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
  convertMs: number;
  detectMs: number;
  frameMs: number;
  frame: number;
  dropped: number;
}

export interface TrackPan {
  dx: number;
  dy: number;
  score: number;
  changed: boolean;
  gw: number;
  panMs: number;
}

export interface CameraViewProps {
  active: boolean;
  style?: unknown;
  accessible?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  onCameraReady?: () => void;
  onHandFrame?: (event: { nativeEvent: HandFrame }) => void;
  onTrackPan?: (event: { nativeEvent: TrackPan }) => void;
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

export interface MemoryStatus {
  availMb: number;
  totalMb: number;
}

export function memoryStatus(): MemoryStatus | null {
  if (!native) {
    return null;
  }
  const status = native.getMemoryStatus();
  if (!(status.availMb > 0) || !(status.totalMb > 0)) {
    return null;
  }
  return status;
}

export function setButtonsActive(active: boolean): boolean {
  if (!native) {
    return false;
  }
  try {
    return native.setButtonsActive(active);
  } catch {
    return false;
  }
}

export function earbudState(): EarbudState | null {
  if (!native) {
    return null;
  }
  try {
    const state = native.getEarbudState();
    return typeof state.connected === 'boolean' ? state : null;
  } catch {
    return null;
  }
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
    frame.convertMs >= 0 &&
    frame.detectMs >= 0 &&
    frame.frameMs >= 0 &&
    frame.frame > 0 &&
    frame.dropped >= 0
  );
}

export function validTrackPan(pan: TrackPan): boolean {
  return (
    Number.isFinite(pan.dx) &&
    Number.isFinite(pan.dy) &&
    typeof pan.changed === 'boolean' &&
    pan.gw > 0 &&
    pan.panMs >= 0
  );
}


