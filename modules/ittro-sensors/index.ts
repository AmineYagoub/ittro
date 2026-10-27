// JS side of the ittro-sensors native module. The module is not wired
// into the app build yet, so this file reports that honestly instead of
// crashing in Expo Go.

interface SensorsStatus {
  available: boolean;
  reason?: string;
  module?: string;
}

interface SensorsNative {
  getStatus: () => SensorsStatus;
}

let native: SensorsNative | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, absent until the dev-client build wires it
  native = require('./native') as SensorsNative;
} catch {
  native = null;
}

export function sensorsStatus(): SensorsStatus {
  if (native && typeof native.getStatus === 'function') {
    return native.getStatus();
  }
  return { available: false, reason: 'native module not wired yet' };
}
