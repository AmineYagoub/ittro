import { RelayError, getMeta, postMeta, relayEndpoint } from './metaCall';
import type { AskExchange, AskHints, ViewReply } from './conversation/askTypes';
import type { Language } from './theme';

export interface RelayConfig {
  url: string;
  accessCode: string;
}

export function relayConfig(): RelayConfig {
  return relayEndpoint();
}

export interface UnderstandContext {
  transcript: string;
  language: string;
  step: string;
  pending_question: string | null;
  pending_request: string | null;
  last_line: string | null;
  effort: string;
  image?: string;
  mime?: string;
  history?: AskExchange[];
  inventory?: string[];
  upset?: boolean;
  brief?: boolean;
}

export interface UnderstandAnswer {
  intent: string;
  language_spoken: string;
  product_text: string | null;
  items: string[] | null;
  detail: string | null;
  target_language: string | null;
  helper_name: string | null;
  question?: string | null;
  // Set when the call carried a still and the sentence asked about the view.
  view?: ViewReply | null;
}

export async function understandUtterance(context: UnderstandContext): Promise<UnderstandAnswer> {
  const body = await postMeta<{ answer?: UnderstandAnswer }>('understand', '/understand', context);
  if (!body.answer) {
    throw new RelayError('broken', null, 'understand answer is missing');
  }
  return body.answer;
}

export interface ShelfBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  confidence: number | null;
}

export interface ShelfMask {
  points: number[];
}

// Where SAM cut the outline: the still's number and the box and mask
// in that still, never moved, so the camera can place it natively.
export interface OutlineAnchor {
  shot: number;
  box: ShelfBox;
  points: number[] | null;
}

export interface ShelfOutline {
  id: number;
  frame: number;
  box: ShelfBox;
  mask?: ShelfMask;
  anchor?: OutlineAnchor;
}

export interface ShelfCrop {
  id: string;
  image: string;
  mime: string;
}

export interface ShelfRead {
  id: string;
  brand_text: string | null;
  size_text: string | null;
  verdict: 'yes' | 'no' | 'unsure';
  spoken: string;
}

export interface SceneView {
  scene: 'shelf' | 'floor' | 'other';
  kinds: string[];
  aisle_hint: string | null;
  /** What the shelf holds, named in the shopper's language; absent from a relay before 2 Nov. */
  shelf_label?: string | null;
  /** Whether the shelf holds the kind requested; absent from a relay before 2 Nov. */
  fits_request?: boolean;
}

export type ConfirmVerdict = 'yes' | 'no' | 'unsure' | 'picture';

export type PictureProblem = 'blurry' | 'dark' | 'glare' | 'far' | 'turned';

export type ConfirmAttr = 'brand' | 'product' | 'variant' | 'size';

export type DetailKind = 'date' | 'size' | 'price' | 'ingredients';

export type DetailReason = 'too_small' | 'blurry' | 'dark' | 'glare' | 'turned' | 'not_visible';

export interface ConfirmAttrs {
  brand: string | null;
  product: string | null;
  variant: string | null;
  size: string | null;
}

export interface ConfirmRead {
  verdict: ConfirmVerdict;
  picture_problem: PictureProblem | null;
  asked: ConfirmAttrs;
  read: ConfirmAttrs;
  label_name: string;
  unreadable: ConfirmAttr[];
}

export interface DetailRead {
  text: string | null;
  reason: DetailReason | null;
}

export async function outlineShelf(
  image: string,
  mime: string,
  phrase: string,
  w: number,
  h: number,
): Promise<{ outlines: ShelfOutline[]; samMs: number; maskMs: number }> {
  return postMeta('outline', '/outline', { image, mime, phrase, w, h });
}

export interface FoundShelf {
  // Each outline carries the name printed on the package.
  outlines: Array<ShelfOutline & { label: string }>;
  groundMs: number;
  samMs: number;
  maskMs: number;
}

async function postFind(request: string, image: string, mime: string, w: number, h: number): Promise<FoundShelf> {
  return postMeta('find', '/find', { request, image, mime, w, h });
}

// The grounding find, unless the build turns it off (EXPO_PUBLIC_FIND=off)
// to compare it with the phrase path on the phone.
export const findShelf = process.env['EXPO_PUBLIC_FIND'] === 'off' ? undefined : postFind;

export interface AskViewArgs extends AskHints {
  question: string | null;
  wanted: string | null;
  language: string;
  image: string;
  mime: string;
}

/** A question about the still, or the not-here summary when wanted names the product not found. */
export async function askAboutView(args: AskViewArgs): Promise<{ view: ViewReply; askMs: number }> {
  return postMeta('ask-view', '/ask-view', args);
}

export async function fetchPackagePhrase(request: string, image: string, mime: string): Promise<string> {
  const body = await postMeta<{ phrase: string }>('package-phrase', '/package-phrase', { request, image, mime });
  return body.phrase;
}

export async function readShelfCrops(
  request: string,
  crops: ShelfCrop[],
): Promise<{ reads: ShelfRead[]; readMs: number }> {
  return postMeta('read-shelf', '/read-shelf', { request, crops });
}

export async function classifySceneView(request: string, image: string, mime: string, language: Language): Promise<SceneView> {
  const body = await postMeta<{ scene: SceneView }>('classify-scene', '/classify-scene', { request, image, mime, language });
  return body.scene;
}

export async function confirmInHand(
  request: string,
  image: string,
  mime: string,
): Promise<{ read: ConfirmRead; readMs: number }> {
  return postMeta('confirm-hand', '/confirm-hand', { request, image, mime });
}

export async function readLabelDetail(
  detail: DetailKind,
  image: string,
  mime: string,
): Promise<{ read: DetailRead; readMs: number }> {
  return postMeta('read-detail', '/read-detail', { detail, image, mime });
}

export interface HelperPairing {
  code: string;
  expiresAt: number;
}

export interface HelperPairStatus {
  state: 'unknown' | 'waiting' | 'joined';
  helper?: string;
  token?: string;
}

export interface HelperAsked {
  id: string;
  helpers: string[];
}

export interface HelperAnswer {
  verdict: 'yes' | 'no' | 'cant_tell';
  note: string | null;
  helper: string;
}

export interface HelperStatus {
  status: 'waiting' | 'answered' | 'cancelled';
  helpers: string[];
  answer: HelperAnswer | null;
}

export async function pairHelper(name: string): Promise<HelperPairing> {
  return postMeta('helper-pair', '/helper-pair', { name });
}

export async function pairStatus(code: string): Promise<HelperPairStatus> {
  return getMeta('helper-pair', `/helper-pair?code=${encodeURIComponent(code)}`);
}

export interface HelperAsk {
  tokens: string[];
  question: string;
  request: string;
  read: string;
  image: string;
  mime: string;
}

export async function askHelper(args: HelperAsk): Promise<HelperAsked> {
  return postMeta('helper-ask', '/helper-ask', args);
}

export async function helperStatus(id: string): Promise<HelperStatus> {
  return getMeta('helper-status', `/helper-status?id=${encodeURIComponent(id)}`);
}

export async function cancelHelper(id: string): Promise<void> {
  await postMeta('helper-cancel', '/helper-cancel', { id });
}


