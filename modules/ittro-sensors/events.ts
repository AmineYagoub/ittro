// Event listeners for the ittro-sensors native module: mic audio,
// the earbud button and volume holds, and earbud connection. Each
// listener reports null when the module is not linked yet.
export interface AudioChunk {
  chunk: string;
  sequence: number;
}

export type ButtonGesture = 'single' | 'double' | 'triple' | 'hold' | 'volumeHold';

export interface ButtonPress {
  gesture: ButtonGesture;
}

export interface EarbudState {
  connected: boolean;
}

export interface ListenerHandle {
  remove: () => void;
}

interface Emitter {
  addListener: (event: string, listener: (payload: never) => void) => ListenerHandle;
}

function emitter(): Emitter | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, absent until prebuild links it
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule: (name: string) => object | null;
      EventEmitter: new (module: object) => Emitter;
    };
    const native = core.requireOptionalNativeModule('IttroSensors');
    return native ? new core.EventEmitter(native) : null;
  } catch {
    return null;
  }
}

function listen<T>(event: string, listener: (payload: T) => void): ListenerHandle | null {
  const found = emitter();
  if (!found) {
    return null;
  }
  try {
    return found.addListener(event, listener as (payload: never) => void);
  } catch {
    return null;
  }
}

export function addAudioChunkListener(listener: (chunk: AudioChunk) => void): ListenerHandle | null {
  return listen<AudioChunk>('onAudioChunk', listener);
}

export function validButtonPress(press: ButtonPress): boolean {
  return (
    press.gesture === 'single' ||
    press.gesture === 'double' ||
    press.gesture === 'triple' ||
    press.gesture === 'hold' ||
    press.gesture === 'volumeHold'
  );
}

export function addButtonListener(listener: (press: ButtonPress) => void): ListenerHandle | null {
  return listen<ButtonPress>('onButtonPress', (press) => {
    if (validButtonPress(press)) {
      listener(press);
    }
  });
}

export function addEarbudListener(listener: (state: EarbudState) => void): ListenerHandle | null {
  return listen<EarbudState>('onEarbudState', (state) => {
    if (typeof state.connected === 'boolean') {
      listener(state);
    }
  });
}
