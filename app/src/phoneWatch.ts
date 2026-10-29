// Watches the phone while Ittro runs: battery and heat alerts go
// to the statechart, a session sample (battery, heat, memory) is
// logged every minute for the timing report, and every state change
// is logged with its time.
import { batteryLow, phoneHot, samplePhone } from './phone';
import { lowBattery, phoneHot as phoneHotLine } from './lines';
import type { Language } from './theme';
import { stamp } from './stamp';

export interface PhoneWatcher {
  sendAlert: (kind: 'battery' | 'heat', text: string) => void;
  lang: () => Language;
}

function sampleLine(at: number, battery: number | null, thermal: number | null, avail: number | null, total: number | null): string {
  const cells = [
    `battery ${battery === null ? 'unknown' : `${battery}%`}`,
    `thermal ${thermal === null ? 'unknown' : thermal}`,
    `mem ${avail === null || total === null ? 'unknown' : `${total - avail}/${total}MB`}`,
    `uptime ${Math.round(at / 60000)}m`,
  ];
  return `session ${cells.join(' ')}`;
}

const started = Date.now();

export function startPhoneWatch(watcher: PhoneWatcher): () => void {
  const checker = setInterval(() => void tick(), 60000);
  return () => clearInterval(checker);

  async function tick(): Promise<void> {
    const at = watcher.lang();
    if (await batteryLow()) {
      watcher.sendAlert('battery', lowBattery[at]);
    }
    if (phoneHot()) {
      watcher.sendAlert('heat', phoneHotLine[at]);
    }
    const sample = await samplePhone();
    if (__DEV__) {
      console.log(`[ittro] ${stamp()} ${sampleLine(Date.now() - started, sample.battery, sample.thermal, sample.memAvailMb, sample.memTotalMb)}`);
    }
  }
}

export function trackState(): (value: unknown) => void {
  let last = '';
  return (value: unknown): void => {
    const flat = JSON.stringify(value);
    if (__DEV__ && flat !== last) {
      console.log(`[ittro] ${stamp()} state ${flat}`);
      last = flat;
    }
  };
}
