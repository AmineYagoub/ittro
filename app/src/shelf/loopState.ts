// The shelf loop's state: fresh at start, and reset for each new
// request or epoch.
import type { LoopState } from './loopTypes';

export function freshState(): LoopState {
  return {
    request: '',
    epoch: -1,
    tracks: [],
    counter: 0,
    phrases: new Map(),
    phraseWait: null,
    cloudBusy: false,
    outlinedAt: null,
    readAt: null,
    sceneChanged: false,
    lastSignature: '',
    lastScene: '',
    failAt: null,
    classifyAt: null,
    emptyPasses: 0,
    emptyOutlines: 0,
    fruitlessPasses: 0,
    blurrySkips: 0,
    sweptEpoch: -1,
    foundKey: '',
    foundTrack: null,
    foundOutline: null,
    crops: new Map(),
    carried: null,
    turnRightNext: true,
    stats: { samCalls: 0, readCalls: 0, readCrops: 0, classifyCalls: 0 },
  };
}

export function searchReset(state: LoopState): void {
  state.tracks = [];
  state.outlinedAt = null;
  state.readAt = null;
  state.sceneChanged = false;
  state.lastSignature = '';
  state.lastScene = '';
  state.emptyPasses = 0;
  state.emptyOutlines = 0;
  state.fruitlessPasses = 0;
  state.blurrySkips = 0;
  state.foundTrack = null;
  state.foundOutline = null;
  state.phraseWait = null;
  state.crops.clear();
  state.carried = null;
  state.turnRightNext = true;
}
