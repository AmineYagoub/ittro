// The mic-and-socket stream: opens the relay socket, then the mic,
// and forwards 24 kHz frames until Meta endpoints a sentence. While
// Ittro speaks it sends silence, so the stream never hears its echo.
import { fromCallback } from 'xstate';
import { addAudioChunkListener, startAudioStream, stopAudioStream } from 'ittro-sensors';
import type { StreamCommand, StreamEmitted, StreamInput } from './types';
import { stamp } from '../stamp';

const READY_TIMEOUT_MS = 12000;

const MIC_RETRY_MS = 5000;

const UNMUTE_TAIL_MS = 300;

const SILENCE_FRAME_BYTES = 3840;

interface RelayMessage {
  type?: string;
  kind?: string;
  transcript?: string;
  message?: string;
}

function decodeChunk(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export const streamClient = fromCallback<StreamEmitted | StreamCommand, StreamInput>(
  ({ sendBack, receive, input }) => {
    let socket: WebSocket | null = null;
    let micStop: (() => void) | null = null;
    let ready = false;
    let muted = true;
    let heldByCommand = true;
    let unmuteAt = 0;
    let lastSequence = -1;
    let live = true;
    let keywords = input.keywords;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let micTimer: ReturnType<typeof setTimeout> | null = null;

    const silence = new Uint8Array(SILENCE_FRAME_BYTES);

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
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(frame);
        } catch {
          // A closing socket ends the stream below.
        }
      }
    };

    const startMic = (): void => {
      if (!live || micStop) {
        return;
      }
      let sub: { remove: () => void } | null = null;
      try {
        sub = addAudioChunkListener((event) => {
          if (!live || !ready) {
            return;
          }
          if (lastSequence >= 0 && event.sequence !== lastSequence + 1 && __DEV__) {
            console.log(`[ittro-debug] ${stamp()} mic gap ${lastSequence} -> ${event.sequence}`);
          }
          lastSequence = event.sequence;
          if (muted || Date.now() < unmuteAt) {
            sendFrame(silence);
            return;
          }
          const frame = decodeChunk(event.chunk);
          if (frame) {
            sendFrame(frame);
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
      lastSequence = -1;
      let current: WebSocket;
      try {
        current = new WebSocket(`${input.url}/realtime?code=${input.code}`);
      } catch {
        sendBack({ type: 'STREAM_ERROR', message: 'could not open the stream' });
        return;
      }
      socket = current;
      readyTimer = setTimeout(() => {
        if (!ready) {
          sendBack({ type: 'STREAM_ERROR', message: 'the stream never answered' });
        }
      }, READY_TIMEOUT_MS);
      current.onopen = (): void => {
        try {
          current.send(JSON.stringify({ type: 'config', keywords }));
        } catch {
          sendBack({ type: 'STREAM_ERROR', message: 'the stream broke' });
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
          muted = heldByCommand;
          if (readyTimer) {
            clearTimeout(readyTimer);
            readyTimer = null;
          }
          sendBack({ type: 'STREAM_OPEN' });
          startMic();
          return;
        }
        if (message.type === 'error') {
          sendBack({ type: 'STREAM_ERROR', message: message.message ?? 'the stream broke' });
          return;
        }
        if (message.kind === 'speechEnd') {
          sendBack({ type: 'SPEECH_ENDED' });
          return;
        }
        if (message.kind === 'speechComplete' && message.transcript) {
          sendBack({ type: 'FINAL_TEXT', text: message.transcript });
        }
      };
      const closed = (): void => {
        sendBack({ type: 'STREAM_CLOSED' });
      };
      current.onerror = closed;
      current.onclose = closed;
    };

    const start = (nextKeywords: string[]): void => {
      keywords = nextKeywords;
      stopMic();
      closeSocket();
      muted = true;
      openSocket();
    };

    const stop = (): void => {
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
