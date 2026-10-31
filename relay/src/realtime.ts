// Realtime transcription: the phone streams mic audio over one socket,
// the relay opens Meta's ENDPOINTING stream and pipes both ways. Cost is
// metered from Meta's own audioProcessedMs, never from phone claims.
import { TRANSCRIBE_USD_PER_SECOND } from './transcribe.ts';
import { buildMetaHandshake, parseMetaEvent, parsePhoneMessage } from './streamWire.ts';
import type { StreamSocket } from './streamWire.ts';

export const REALTIME_RESERVE_SECONDS = 600;

const CHARGE_EVERY_MS = 30000;

const CONFIG_TIMEOUT_MS = 10000;

const ACK_TIMEOUT_MS = 10000;

export interface StreamBudget {
  spendToday(): Promise<number>;
  addSpend(usd: number): Promise<void>;
  budget(): number;
}

export function processedMsToUsd(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 0;
  }
  return (ms / 1000) * TRANSCRIBE_USD_PER_SECOND;
}

function later(ms: number, fn: () => void): () => void {
  const timer = setTimeout(fn, ms) as unknown as { unref?: () => void };
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return () => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>);
}

export function startRealtimeSession(
  client: StreamSocket,
  openMeta: (url: string) => StreamSocket,
  metaUrl: string,
  apiKey: string,
  budget: StreamBudget,
): void {
  let meta: StreamSocket | null = null;
  let metaReady = false;
  let processedMs = 0;
  let chargedMs = 0;
  let settled = false;
  let ended = false;

  const fail = (message: string): void => {
    try {
      client.send(JSON.stringify({ type: 'error', message }));
    } catch {
      // The phone is gone; settling still runs.
    }
    finish();
  };

  // Each charge also re-reads the day's spend: a stream that is
  // open when the budget runs out ends there, instead of streaming
  // on until the phone reconnects.
  const charge = (nowMs: number): void => {
    if (nowMs > processedMs) {
      processedMs = nowMs;
    }
    if (processedMs - chargedMs >= CHARGE_EVERY_MS) {
      const due = processedMsToUsd(processedMs - chargedMs);
      chargedMs = processedMs;
      void budget
        .addSpend(due)
        .then(() => budget.spendToday())
        .then((spent) => {
          if (!settled && spent > budget.budget()) {
            fail('daily budget reached, back tomorrow');
          }
        })
        .catch(() => undefined);
    }
  };

  const finish = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    cancelConfig();
    cancelAck();
    const due = processedMsToUsd(processedMs - chargedMs);
    if (due > 0) {
      void budget.addSpend(due);
    }
    try {
      meta?.close();
    } catch {
      // Meta is gone already.
    }
    try {
      client.close();
    } catch {
      // The phone is gone already.
    }
  };

  const cancelConfig = later(CONFIG_TIMEOUT_MS, () => fail('transcribe stream got no config'));
  let cancelAck: () => void = () => undefined;

  client.onclose = () => finish();
  client.onerror = () => finish();

  client.onmessage = (data): void => {
    if (settled) {
      return;
    }
    if (typeof data !== 'string') {
      if (metaReady && meta) {
        try {
          meta.send(data);
        } catch {
          fail('transcribe stream broke');
        }
      }
      return;
    }
    const message = parsePhoneMessage(data);
    if (!message) {
      fail('bad transcribe message');
      return;
    }
    if (message.kind === 'end') {
      if (ended) {
        return;
      }
      ended = true;
      try {
        meta?.send(JSON.stringify({ type: 'endStream' }));
      } catch {
        finish();
      }
      return;
    }
    if (meta) {
      return;
    }
    void budget.spendToday().then((spent) => {
      if (settled) {
        return;
      }
      if (spent + REALTIME_RESERVE_SECONDS * TRANSCRIBE_USD_PER_SECOND > budget.budget()) {
        fail('daily budget reached, back tomorrow');
        return;
      }
      cancelConfig();
      const downstream = openMeta(metaUrl);
      meta = downstream;
      cancelAck = later(ACK_TIMEOUT_MS, () => fail('transcribe stream got no answer'));
      downstream.onopen = (): void => {
        if (settled) {
          return;
        }
        try {
          downstream.send(JSON.stringify(buildMetaHandshake(apiKey, message.keywords)));
        } catch {
          fail('transcribe stream broke');
        }
      };
      downstream.onclose = () => finish();
      downstream.onerror = () => finish();
      downstream.onmessage = (event): void => {
        if (settled || typeof event !== 'string') {
          return;
        }
        const parsed = parseMetaEvent(event);
        if (!parsed) {
          return;
        }
        charge(parsed.audioProcessedMs);
        if (parsed.kind === 'error') {
          fail(parsed.message ?? 'transcribe stream error');
          return;
        }
        if (parsed.kind === 'ack') {
          cancelAck();
          metaReady = true;
          try {
            client.send(JSON.stringify({ type: 'ready' }));
          } catch {
            finish();
          }
          return;
        }
        try {
          client.send(JSON.stringify(parsed));
        } catch {
          finish();
        }
      };
    });
  };
}
