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
import type { PairHelperInput, PairHelperOutput, SendHelpInput, SendHelpOutput } from '../src/helper/actors';

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

export type PairScript = (input: PairHelperInput) => PairHelperOutput | Promise<PairHelperOutput>;

export type SendScript = (input: SendHelpInput) => SendHelpOutput | Promise<SendHelpOutput>;

export interface Driver {
  spoken: string[];
  parts: SpeechPart[][];
  streamCommands: StreamCommand[];
  start: () => Promise<void>;
  holdSpeech: (hold: boolean) => void;
  setUnderstand: (script: UnderstandScript) => void;
  setHelper: (scripts: { pair?: PairScript; send?: SendScript }) => void;
  send: (event: ConversationEvent) => void;
  heard: (text: string) => Promise<void>;
  partial: (text: string) => Promise<void>;
  flush: () => Promise<void>;
  advance: (ms: number) => Promise<void>;
  talk: () => string;
  search: () => string;
  guide: () => string;
  confirm: () => string;
  helper: () => string;
  link: () => string;
  context: () => ConversationContext;
  stop: () => void;
}

const FLUSH_ROUNDS = 40;

export function startConversation(options?: StartOptions): Driver {
  const spoken: string[] = [];
  const parts: SpeechPart[][] = [];
  const streamCommands: StreamCommand[] = [];
  let script: UnderstandScript = () => answer({ intent: 'not_understood' });
  let pairScript: PairScript = (input) => ({ name: input.name, code: '482715', expiresAt: Date.now() + 600000 });
  let sendScript: SendScript = () => ({ id: 'q1', helpers: ['Sara'], photo: null });
  let speechHeld = false;
  let speechGate: (() => void) | null = null;
  const provided = conversationMachine.provide({
    actors: {
      speakMany: fromPromise<void, SpeakInput>(async ({ input }) => {
        if (speechHeld) {
          await new Promise<void>((release) => {
            speechGate = release;
          });
        }
        for (const line of input.lines) {
          spoken.push(line.text);
        }
      }),
      speakParts: fromPromise<void, SpeakPartsInput>(async ({ input }) => {
        if (input.parts.length > 0) {
          parts.push(input.parts);
        }
      }),
      understandAnswer:
        options?.understandLogic ??
        fromPromise(async ({ input }: { input: UnderstandInput }) => script(input)),
      tourSequence: fromPromise<void, TourInput>(async () => undefined),
      ticking: fromCallback(() => () => undefined),
      streamClient: fromCallback<StreamEmitted | StreamCommand, StreamInput>(({ receive }) => {
        receive((event: StreamCommand) => {
          streamCommands.push(event);
        });
      }),
      pairHelper: fromPromise<PairHelperOutput, PairHelperInput>(async ({ input }) => pairScript(input)),
      sendHelp: fromPromise<SendHelpOutput, SendHelpInput>(async ({ input }) => sendScript(input)),
      pairPoll: fromCallback(() => () => undefined),
      answerPoll: fromCallback(() => () => undefined),
      pulseTick: fromCallback(() => () => undefined),
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
        helpers: [],
        brands: [],
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
    streamCommands,
    async start(): Promise<void> {
      actor.start();
      await flush();
    },
    holdSpeech(hold: boolean): void {
      speechHeld = hold;
      if (!hold && speechGate) {
        const release = speechGate;
        speechGate = null;
        release();
      }
    },
    setUnderstand(next: UnderstandScript): void {
      script = next;
    },
    setHelper(scripts: { pair?: PairScript; send?: SendScript }): void {
      if (scripts.pair) {
        pairScript = scripts.pair;
      }
      if (scripts.send) {
        sendScript = scripts.send;
      }
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
    confirm(): string {
      const value = actor.getSnapshot().value;
      if (typeof value === 'string') {
        return value;
      }
      return (value as { live: { confirm: string } }).live.confirm;
    },
    helper(): string {
      const value = actor.getSnapshot().value;
      if (typeof value === 'string') {
        return value;
      }
      return (value as { live: { helper: string } }).live.helper;
    },
    link(): string {
      const value = actor.getSnapshot().value;
      if (typeof value === 'string') {
        return value;
      }
      return (value as { live: { link: string } }).live.link;
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
