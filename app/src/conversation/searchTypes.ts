// The search slice's types: the context fields the shelf search keeps
// and the events the shelf loop sends. The conversation's context and
// event union take them in from here.
import type { LinkKind } from '../metaCall';
import type { ShelfOutline } from '../relay';
import type { GuidePosition, SpokenLine } from './types';
import type { SweepCue } from '../shelf/sweep';

export interface SearchAnnouncement extends SpokenLine {
  kind: 'status' | 'alternative' | 'sweep';
}

export interface SearchContext {
  cameraOn: boolean;
  searching: boolean;
  outlines: ShelfOutline[];
  checkedCount: number;
  searchEpoch: number;
  pendingSearch: SearchAnnouncement[];
  alternative: string | null;
  shelfTarget: ShelfOutline | null;
  shelfCrop: string | null;
  readingSaidEpoch: number;
}

export type SearchEvent =
  | { type: 'SEARCH_BEGIN' }
  | { type: 'SEARCH_END' }
  | { type: 'SHELF_OUTLINED'; outlines: ShelfOutline[]; kind: string }
  | { type: 'SHELF_SWEPT'; checked: number }
  | { type: 'WRONG_SHELF'; shelf: string | null; product: string }
  | { type: 'HAND_HOLD' }
  | { type: 'SEARCH_FAILED'; kind: LinkKind }
  | { type: 'SHELF_FOUND'; product: string; outline: ShelfOutline | null; matches: number; kind: string; position: GuidePosition; crop?: string | null }
  | { type: 'NO_SHELF'; floor: boolean }
  | { type: 'OUTLINES_MOVED'; outlines: ShelfOutline[] }
  | { type: 'SHELF_TURN'; direction: 'left' | 'right' }
  | { type: 'SWEEP_CUE'; cue: SweepCue; product: string }
  | { type: 'NOT_HERE'; wanted: string; answer: string; offer: string | null; checked: number; whole: boolean };
