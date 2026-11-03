// Expo config. The relay URL and access code come from the environment
// at build time and are never committed: ITTRO_RELAY_URL and
// ITTRO_ACCESS_CODE. Neither is the Meta key; only the relay holds that.
// ITTRO_LOGS=off silences the timeline for the store build; test
// builds keep it on. release-please sets VERSION from the pull request
// titles when it prepares a release (docs/contributing/releases.md), and
// Android's version code is worked out from it.
import type { ExpoConfig } from 'expo/config';

// x-release-please-start-version
const VERSION = '0.1.0';
// x-release-please-end

/** Android's version code for a version: major × 1,000,000 + minor × 10,000 + patch × 100 + n, where n is a beta's number (1 to 98) or 99 for a release, so it only goes up. */
export function versionCode(version: string): number {
  const parts = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(version);
  if (!parts) {
    throw new Error(`${version} is not a version Android can number`);
  }
  const [major, minor, patch] = [parts[1], parts[2], parts[3]].map(Number) as [number, number, number];
  const beta = parts[4] === undefined ? 99 : Number(parts[4]);
  if (minor > 99 || patch > 99 || beta < 1 || beta > 99 || (parts[4] !== undefined && beta > 98)) {
    throw new Error(`${version} is outside what Android's version code can hold`);
  }
  return major * 1_000_000 + minor * 10_000 + patch * 100 + beta;
}

const config: ExpoConfig = {
  name: 'Ittro',
  slug: 'ittro',
  version: VERSION,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  android: {
    package: 'dev.ittro.app',
    versionCode: versionCode(VERSION),
    permissions: ['RECORD_AUDIO', 'CAMERA'],
    adaptiveIcon: {
      backgroundColor: '#2A62F0',
      foregroundImage: './assets/adaptive-icon-foreground.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
    },
  },
  plugins: [
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        backgroundColor: '#0B0E13',
        dark: {
          image: './assets/splash-icon.png',
          backgroundColor: '#0B0E13',
        },
      },
    ],
    'expo-localization',
    './plugins/ittro-buttons.js',
    './plugins/ittro-network.js',
  ],
  extra: {
    relayUrl: process.env['ITTRO_RELAY_URL'] ?? 'https://ittro.djazair.dev',
    accessCode: process.env['ITTRO_ACCESS_CODE'] ?? '',
    logs: process.env['ITTRO_LOGS'] !== 'off',
  },
};

export default config;
