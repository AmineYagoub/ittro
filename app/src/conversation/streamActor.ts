// The mic-and-socket stream: opens the relay socket and the mic
// together, buffering up to two seconds of 24 kHz frames until the
// relay answers ready, then forwards live until Meta endpoints a
// sentence. While Ittro speaks it sends silence, so the stream never
// hears its echo. Restarts wait 1 s, 2 s, 4 s and on, and the log
// says why the socket closed.
import { fromCallback } from 'xstate';
import { addAudioChunkListener, startAudioStream, stopAudioStream } from 'ittro-sensors';
import type { StreamCommand, StreamEmitted, StreamInput } from './types';
import { createMicStats, decodeChunk } from './micStats';
import { createStreamRetry } from './streamRetry';
import { logIttro } from '../log';

const READY_TIMEOUT_MS = 12000;

const MIC_RETRY_MS = 5000;

const UNMUTE_TAIL_MS = 300;

const SILENCE_FRAME_BYTES = 3840;

const MIC_SUMMARY_EVERY = 100;

const PRE_READY_BUFFER = 25;

interface RelayMessage {
  type?: string;
  kind?: string;
  transcript?: string;
  final?: boolean;
  message?: string;
}

interface SocketClosedEvent {
  code: unknown;
  reason: unknown;
}

function note(line: string): void {
  logIttro(line);
}

export const streamClient = fromCallback<StreamEmitted | StreamCommand, StreamInput>(
  ({ sendBack, receive, input }) => {
    let socket: WebSocket | null = null;
    let micStop: (() => void) | null = null;
    let ready = false;
    let muted = true;
    let heldByCommand = true;
    let unmuteAt = 0;
    let live = true;
    let keywords = input.keywords;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let micTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: Uint8Array[] = [];
    const retry = createStreamRetry(input.retryBaseMs, note);
    const stats = createMicStats(() => Date.now());

    const silence = new Uint8Array(SILENCE_FRAME_BYTES);

    const summarizeMic = (): void => {
      const summary = stats.snapshot();
      note(
        `mic ${summary.ratePerSecond.toFixed(1)}/s gap p50 ${summary.gapP50}ms p95 ${summary.gapP95}ms max ${summary.gapMax}ms seqgaps ${summary.seqGaps} notready ${summary.notReady} senderr ${summary.sendErr}`,
      );
      stats.reset();
    };

    const stopMic = (): void => {
      if (micTimer) {
        clearTimeout(micTimer);
        micTimer = null;
      }
      micStop?.();
      micStop = null;
      try {
        stopAudioStream();
      } catch {
        // The mic is already gone.
      }
    };

    const closeSocket = (): void => {
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
      retry.cancel();
      ready = false;
      const current = socket;
      socket = null;
      if (current) {
        current.onopen = null;
        current.onmessage = null;
        current.onerror = null;
        current.onclose = null;
        try {
          current.close();
        } catch {
          // The socket is already gone.
        }
      }
    };

    const sendFrame = (frame: Uint8Array): void => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        stats.failSend();
        return;
      }
      try {
        socket.send(frame);
      } catch {
        stats.failSend();
      }
    };

    const holdFrame = (frame: Uint8Array): void => {
      if (pending.length >= PRE_READY_BUFFER) {
        pending = pending.slice(pending.length - PRE_READY_BUFFER + 1);
        stats.dropPreReady();
      }
      pending.push(frame);
    };

    const startMic = (): void => {
      if (!live || micStop) {
        return;
      }
      let sub: { remove: () => void } | null = null;
      try {
        sub = addAudioChunkListener((event) => {
          if (!live) {
            return;
          }
          const at = Date.now();
          stats.arrival(event.sequence);
          if (stats.count() >= MIC_SUMMARY_EVERY) {
            summarizeMic();
          }
          const frame = muted || at < unmuteAt ? silence : (decodeChunk(event.chunk) ?? silence);
          if (ready) {
            sendFrame(frame);
          } else {
            holdFrame(frame);
          }
        });
      } catch {
        sub = null;
      }
      let started = false;
      try {
        started = sub !== null && startAudioStream();
      } catch {
        started = false;
      }
      if (!started) {
        sub?.remove();
        sendBack({ type: 'MIC_FAILED' });
        micTimer = setTimeout(startMic, MIC_RETRY_MS);
        return;
      }
      micStop = () => sub?.remove();
    };

    const openSocket = (): void => {
      if (!live) {
        return;
      }
      pending = [];
      let reported = false;
      let current: WebSocket;
      try {
        current = new WebSocket(`${input.url}/realtime?code=${input.code}`);
      } catch {
        retry.failed();
        sendBack({ type: 'STREAM_FAILED', message: 'could not open the stream' });
        return;
      }
      socket = current;
      startMic();
      readyTimer = setTimeout(() => {
        if (!ready) {
          retry.failed();
          sendBack({ type: 'STREAM_FAILED', message: 'the stream never answered' });
        }
      }, READY_TIMEOUT_MS);
      current.onopen = (): void => {
        try {
          current.send(JSON.stringify({ type: 'config', keywords }));
        } catch {
          sendBack({ type: 'STREAM_FAILED', message: 'the stream broke' });
        }
      };
      current.onmessage = (event): void => {
        if (typeof event.data !== 'string') {
          return;
        }
        let message: RelayMessage;
        try {
          message = JSON.parse(event.data) as RelayMessage;
        } catch {
          return;
        }
        if (message.type === 'ready') {
          ready = true;
          retry.ready();
          muted = heldByCommand;
          if (readyTimer) {
            clearTimeout(readyTimer);
            readyTimer = null;
          }
          const held = pending;
          pending = [];
          for (const frame of held) {
            sendFrame(frame);
          }
          sendBack({ type: 'STREAM_OPEN' });
          startMic();
          return;
        }
        if (message.type === 'error') {
          note(`stream error from relay: ${String(message.message ?? 'the stream broke').slice(0, 120)}`);
          sendBack({ type: 'STREAM_ERROR', message: message.message ?? 'the stream broke' });
          return;
        }
        if (message.kind === 'speechEnd') {
          sendBack({ type: 'SPEECH_ENDED' });
          return;
        }
        if (message.kind === 'speechComplete' && message.transcript) {
          sendBack({ type: 'FINAL_TEXT', text: message.transcript });
          return;
        }
        if (message.kind === 'transcript' && !message.final && message.transcript) {
          sendBack({ type: 'PARTIAL_TEXT', text: message.transcript });
        }
      };
      const closed = (event: Event): void => {
        if (reported) {
          return;
        }
        reported = true;
        retry.failed();
        const wasReady = ready;
        const body = event as unknown as SocketClosedEvent;
        const code = typeof body.code === 'number' ? body.code : '?';
        const reason = typeof body.reason === 'string' && body.reason.length > 0 ? body.reason : '-';
        note(`stream socket closed code ${code} reason ${reason.slice(0, 80)} ${wasReady ? 'after' : 'before'} ready`);
        sendBack(
          wasReady ? { type: 'STREAM_CLOSED' } : { type: 'STREAM_FAILED', message: 'the stream broke' },
        );
      };
      current.onerror = closed;
      current.onclose = closed;
    };

    const reopen = (): void => {
      stopMic();
      closeSocket();
      muted = true;
      pending = [];
      openSocket();
    };

    const start = (nextKeywords: string[]): void => {
      keywords = nextKeywords;
      retry.start(reopen);
    };

    const stop = (): void => {
      retry.stop();
      stopMic();
      closeSocket();
    };

    receive((event: StreamCommand) => {
      if (event.type === 'MUTE') {
        heldByCommand = true;
        muted = true;
      } else if (event.type === 'UNMUTE') {
        heldByCommand = false;
        muted = false;
        unmuteAt = Date.now() + UNMUTE_TAIL_MS;
      } else if (event.type === 'STOP') {
        stop();
      } else if (event.type === 'START') {
        start(event.keywords);
      }
    });

    openSocket();

    return () => {
      live = false;
      stop();
    };
  },
);
