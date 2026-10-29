// The confirm loop's shapes: the injected clock, still photo and
// cloud reads it runs on, and the per-check state it keeps between
// shots. The loop itself lives in loop.ts.
import type { ConfirmRead, DetailKind, DetailRead } from '../relay';
import type { ConversationEvent } from '../conversation/types';
import type { HandFix } from '../guide/types';

export interface ConfirmPhoto {
  image: string;
  mime: string;
  crop: string;
}

export interface ConfirmLoopContext {
  epoch: number;
  request: string;
  detailKind: DetailKind | null;
  final: boolean;
}

export interface ConfirmLoopDeps {
  now: () => number;
  shoot: () => Promise<ConfirmPhoto | null>;
  confirm: (request: string, image: string, mime: string) => Promise<{ read: ConfirmRead; readMs: number }>;
  detail: (kind: DetailKind, image: string, mime: string) => Promise<{ read: DetailRead; readMs: number }>;
  readContext: () => ConfirmLoopContext;
  handNow: () => HandFix | null;
  send: (event: ConversationEvent) => void;
  log: (line: string) => void;
}

export interface ConfirmLoop {
  begin: () => void;
  stop: () => void;
  tick: () => void;
}

export interface ConfirmLoopState {
  active: boolean;
  epoch: number;
  tries: number;
  flight: number;
  lastShotAt: number;
  gaveUp: boolean;
}

export function freshConfirmState(): ConfirmLoopState {
  return { active: false, epoch: 0, tries: 0, flight: 0, lastShotAt: 0, gaveUp: false };
}
