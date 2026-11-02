// The shelf loop's state: fresh at start, and reset for each new
// request or epoch. The camera's recent pans outlive a request, as the
// camera does.
import type { LoopState } from './loopTypes';
import { idleSweep } from './sweep';

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
    outlinedPan: null,
    panSamples: [],
    recutAt: null,
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
    sweep: idleSweep(),
    lastStill: null,
    stats: { samCalls: 0, readCalls: 0, readCrops: 0, classifyCalls: 0, findCalls: 0 },
  };
}

export function searchReset(state: LoopState): void {
  state.tracks = [];
  state.outlinedAt = null;
  state.outlinedPan = null;
  state.recutAt = null;
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
  state.sweep = idleSweep();
  state.lastStill = null;
}
