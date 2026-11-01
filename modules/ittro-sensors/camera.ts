// The camera view's props and events for the ittro-sensors native
// module: hand frames, track pans and the guided outline it draws.
export interface HandFrame {
  present: boolean;
  x: number;
  y: number;
  confidence: number;
  handWidth: number;
  boxX1?: number;
  boxY1?: number;
  boxX2?: number;
  boxY2?: number;
  convertMs: number;
  detectMs: number;
  frameMs: number;
  frame: number;
  dropped: number;
  // The drawn outline's key and how far the camera moved it, in photo pixels.
  outlineKey?: string;
  outlineDx?: number;
  outlineDy?: number;
}

export interface TrackPan {
  dx: number;
  dy: number;
  score: number;
  changed: boolean;
  gw: number;
  panMs: number;
}

// The guided outline the camera draws and moves natively every frame:
// SAM's cut in the still numbered `shot` (null: placed as it is now).
export interface CameraOutline {
  key: string;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  points: number[] | null;
  shot: number | null;
}

export interface CameraViewProps {
  active: boolean;
  outline?: CameraOutline | null;
  style?: unknown;
  accessible?: boolean;
  importantForAccessibility?: 'auto' | 'yes' | 'no' | 'no-hide-descendants';
  onCameraReady?: () => void;
  onHandFrame?: (event: { nativeEvent: HandFrame }) => void;
  onTrackPan?: (event: { nativeEvent: TrackPan }) => void;
  onCameraError?: (event: { nativeEvent: { message: string } }) => void;
}

export interface CameraViewComponent {
  (props: CameraViewProps): null;
}

export function validHandFrame(frame: HandFrame): boolean {
  return (
    typeof frame.present === 'boolean' &&
    (!frame.present || (frame.x >= 0 && frame.y >= 0 && frame.confidence >= 0)) &&
    frame.convertMs >= 0 &&
    frame.detectMs >= 0 &&
    frame.frameMs >= 0 &&
    frame.frame > 0 &&
    frame.dropped >= 0
  );
}

export function validTrackPan(pan: TrackPan): boolean {
  return (
    Number.isFinite(pan.dx) &&
    Number.isFinite(pan.dy) &&
    typeof pan.changed === 'boolean' &&
    pan.gw > 0 &&
    pan.panMs >= 0
  );
}


