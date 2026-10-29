// Drives the real statechart with scripted speech, understanding and
// time, so tests walk conversation paths without a phone.
import { SimulatedClock, createActor, fromCallback, fromPromise } from 'xstate';
import { understandAnswer } from '../src/conversation/actors';
import { conversationMachine } from '../src/conversation/machine';
import type {
  ConversationContext,
  ConversationEvent,
  SpeakInput,
  SpeakPartsInput,
  SpeechPart,
  StreamCommand,
  StreamEmitted,
  StreamInput,
  TourInput,
  UnderstandInput,
} from '../src/conversation/types';
import type { Language } from '../src/theme';
import type { UnderstandAnswer } from '../src/relay';

export type UnderstandScript = (input: UnderstandInput) => UnderstandAnswer | Promise<UnderstandAnswer>;

export function answer(patch: Partial<UnderstandAnswer> & { intent: string }): UnderstandAnswer {
  return {
    intent: patch.intent,
    language_spoken: patch.language_spoken ?? 'en',
    product_text: patch.product_text ?? null,
    items: patch.items ?? null,
    detail: patch.detail ?? null,
    target_language: patch.target_language ?? null,
    helper_name: patch.helper_name ?? null,
  };
}

export interface StartOptions {
  language?: Language;
  firstLaunchDone?: boolean;
  request?: string | null;
  understandLogic?: typeof understandAnswer;
}

export interface Driver {
  spoken: string[];
  parts: SpeechPart[][];
  start: () => Promise<void>;
  setUnderstand: (script: UnderstandScript) => void;
  send: (event: ConversationEvent) => void;
  heard: (text: string) => Promise<void>;
  partial: (text: string) => Promise<void>;
  flush: () => Promise<void>;
  advance: (ms: number) => Promise<void>;
  talk: () => string;
  search: () => string;
  guide: () => string;
  context: () => ConversationContext;
  stop: () => void;
}

const FLUSH_ROUNDS = 40;

export function startConversation(options?: StartOptions): Driver {
  const spoken: string[] = [];
  const parts: SpeechPart[][] = [];
  let script: UnderstandScript = () => answer({ intent: 'not_understood' });
  const provided = conversationMachine.provide({
    actors: {
      speakMany: fromPromise<void, SpeakInput>(async ({ input }) => {
        for (const line of input.lines) {
          spoken.push(line.text);
        }
      }),
      speakParts: fromPromise<void, SpeakPartsInput>(async ({ input }) => {
        parts.push(input.parts);
      }),
      understandAnswer:
        options?.understandLogic ??
        fromPromise(async ({ input }: { input: UnderstandInput }) => script(input)),
      tourSequence: fromPromise<void, TourInput>(async () => undefined),
      ticking: fromCallback(() => () => undefined),
      streamClient: fromCallback<StreamEmitted | StreamCommand, StreamInput>(() => () => undefined),
    },
  });
  const clock = new SimulatedClock();
  const actor = createActor(provided, {
    clock,
    input: {
      prefs: {
        language: options?.language ?? 'en',
        firstLaunchDone: options?.firstLaunchDone ?? true,
        brief: false,
        rate: 1,
      },
      snapshot: { request: options?.request ?? null },
      relayUrl: 'http://localhost:8787',
      relayCode: 'test-code',
    },
  });

  async function flush(): Promise<void> {
    for (let row = 0; row < FLUSH_ROUNDS; row += 1) {
      await Promise.resolve();
    }
  }

  return {
    spoken,
    parts,
    async start(): Promise<void> {
      actor.start();
      await flush();
    },
    setUnderstand(next: UnderstandScript): void {
      script = next;
    },
    send(event: ConversationEvent): void {
      actor.send(event);
    },
    async heard(text: string): Promise<void> {
      actor.send({ type: 'FINAL_TEXT', text });
      await flush();
    },
    async partial(text: string): Promise<void> {
      actor.send({ type: 'PARTIAL_TEXT', text });
      await flush();
    },
    flush,
    async advance(ms: number): Promise<void> {
      clock.increment(ms);
      await flush();
    },
    talk(): string {
      const value = actor.getSnapshot().value;
      if (typeof value === 'string') {
        return value;
      }
      return (value as { live: { talk: string } }).live.talk;
    },
    search(): string {
      const value = actor.getSnapshot().value;
      if (typeof value === 'string') {
        return value;
      }
      return (value as { live: { search: string } }).live.search;
    },
    guide(): string {
      const value = actor.getSnapshot().value;
      if (typeof value === 'string') {
        return value;
      }
      return (value as { live: { guide: string } }).live.guide;
    },
    context(): ConversationContext {
      return actor.getSnapshot().context;
    },
    stop(): void {
      actor.stop();
    },
  };
}

export async function startListening(options?: StartOptions): Promise<Driver> {
  const driver = startConversation(options);
  await driver.start();
  return driver;
}
