// Ittro theme, copied from docs/design/tokens/tokens.json.
// The JSON file is the source of truth; change it there first.

export const color = {
  ink: '#0B0E13',
  panel: '#161B23',
  line: '#2A313C',
  paper: '#F5F3EE',
  muted: '#A9B1BD',
  brand: '#2A62F0',
  brandLight: '#7EA6FF',
  brandPale: '#B8CCFF',
  brandDeep: '#1E2A44',
  yes: '#2BD98A',
  yesInk: '#0A3B25',
  no: '#B3261E',
  notSure: '#FFB224',
  notSureInk: '#3A2A06',
} as const;

export type Verdict = 'yes' | 'no' | 'notSure';

export const verdictStyle = {
  yes: { background: '#2BD98A', text: '#0B0E13' },
  no: { background: '#B3261E', text: '#FFFFFF' },
  notSure: { background: '#FFB224', text: '#0B0E13' },
} as const;

export const font = {
  family: 'Readex Pro',
  spokenLine: { size: 32, weight: '600' as const, lineHeight: 1.3 },
  spokenLineArabic: { size: 34, weight: '600' as const, lineHeight: 1.4 },
  chip: { size: 20, weight: '500' as const, chipHeight: 44 },
  verdictWord: { size: 48, weight: '700' as const },
} as const;

export const size = {
  screenPadding: 24,
  panelRadius: 28,
  voiceIndicator: 60,
  directionCircle: 64,
} as const;

export const haptics = {
  yes: [0, 60, 80, 60],
  no: [0, 120, 90, 120, 90, 120],
  notSure: [0, 400],
  startVolumeBuzz: [0, 60],
} as const;

export type Language = 'en' | 'ar' | 'fr';

export const speech = {
  defaultLanguage: 'en' as Language,
  lineStartsWithinMs: 300,
  firstLaunchListenMs: 5000,
  firstLaunchWords: { ar: 'عربي', fr: 'français' },
  workingTickEveryMs: 2000,
  idlePauseAfterMs: 120000,
  lowVolumeThreshold: 0.3,
  raisedVolume: 0.5,
  lowBatteryPercent: 15,
} as const;

export const soundFile = {
  heard: 'heard.wav',
  listening: 'listening.wav',
  workingTick: 'working-tick.wav',
  lost: 'lost.wav',
  proximityTick: 'proximity-tick.wav',
  helperPulse: 'helper-pulse.wav',
  pausing: 'pausing.wav',
  waking: 'waking.wav',
  yes: 'yes.wav',
  no: 'no.wav',
  notSure: 'not-sure.wav',
} as const;

export type SoundName = keyof typeof soundFile;
