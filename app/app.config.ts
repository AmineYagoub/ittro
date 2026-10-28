// Expo config. The relay URL and access code come from the environment
// at build time and are never committed: ITTRO_RELAY_URL and
// ITTRO_ACCESS_CODE. Neither is the Meta key; only the relay holds that.
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Ittro',
  slug: 'ittro',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  android: {
    package: 'dev.ittro.app',
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
  ],
  extra: {
    relayUrl: process.env['ITTRO_RELAY_URL'] ?? 'https://ittro.djazair.dev',
    accessCode: process.env['ITTRO_ACCESS_CODE'] ?? '',
  },
};

export default config;
