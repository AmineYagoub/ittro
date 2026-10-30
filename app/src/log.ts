// Test-build logging: the [ittro] timeline stays on in release
// builds for measuring the demo, and the store build turns it off.
// One setting, read here, so no log line checks __DEV__ itself.
import Constants from 'expo-constants';
import { stamp } from './stamp';

let override: boolean | null = null;

export function setLogsOverride(value: boolean | null): void {
  override = value;
}

export function releaseLogsOn(extra: unknown): boolean {
  if (override !== null) {
    return override;
  }
  return (extra as Record<string, unknown> | null)?.['logs'] !== false;
}

export function logsOn(): boolean {
  if (override !== null) {
    return override;
  }
  if (__DEV__) {
    return true;
  }
  const extra = (Constants.expoConfig?.extra ?? null) as Record<string, unknown> | null;
  return releaseLogsOn(extra);
}

export function logIttro(line: string): void {
  if (logsOn()) {
    console.log(`[ittro] ${stamp()} ${line}`);
  }
}
