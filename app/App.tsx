// Ittro phase 2: first launch by voice, then the spoken Welcome.
// No product search yet: this screen is where the next phases begin.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Font from 'expo-font';
import { ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import * as SplashScreen from 'expo-splash-screen';
import * as Localization from 'expo-localization';
import { initVoice, playSound, say, stopVoice } from './src/speech';
import { listenOnce } from './src/listen';
import { loadPrefs, savePrefs } from './src/store';
import { checkPhoneOnce, preparePhone, restPhone, watchAppState } from './src/phone';
import { sensorsStatus } from 'ittro-sensors';
import { buttonsLine, chooseLanguage, lowBattery, micLine, phoneHot, privacyLine, refusedCamera, refusedMic, tourMeaning, tourOffer, welcome, welcomeBack } from './src/lines';
import { color, font, size, speech } from './src/theme';
import type { Language } from './src/theme';

const LISTEN_LOCALE: Record<Language, string> = { en: 'en-US', ar: 'ar-SA', fr: 'fr-FR' };
const YES_WORDS: Record<Language, string[]> = {
  en: ['yes', 'yeah', 'yep'],
  ar: ['نعم', 'أيوه', 'ايوه', 'أجل'],
  fr: ['oui', 'ouais'],
};

void SplashScreen.preventAutoHideAsync();

export default function App(): React.JSX.Element {
  const [line, setLine] = useState('…');
  const [chips, setChips] = useState<string[]>([]);
  const [lang, setLang] = useState<Language>('en');
  const [cameraOn, setCameraOn] = useState(false);
  const [, requestCamera] = useCameraPermissions();
  const alive = useRef(true);
  const paused = useRef(false);
  const flowDone = useRef(false);
  const resumeWake = useRef<(() => void) | null>(null);

  useEffect(() => {
    alive.current = true;
    void run();
    const unwatch = watchAppState(onPause, onResume);
    const checker = setInterval(watchPhone, 60000);
    return () => {
      alive.current = false;
      unwatch();
      clearInterval(checker);
      restPhone();
      stopVoice();
    };
  }, []);

  function onPause(): void {
    paused.current = true;
    stopVoice();
    restPhone();
    setCameraOn(false);
  }

  function onResume(): void {
    paused.current = false;
    void preparePhone();
    resumeWake.current?.();
    resumeWake.current = null;
    if (flowDone.current && alive.current) {
      setCameraOn(true);
      void speak(`${welcomeBack[langRef.current]} ${welcome[langRef.current]}`, langRef.current, ['help']);
    }
  }

  async function waitWhilePaused(): Promise<boolean> {
    while (paused.current && alive.current) {
      await new Promise<void>((resolve) => {
        resumeWake.current = resolve;
      });
    }
    return alive.current;
  }

  async function speak(text: string, at: Language, chipsNow: string[] = []): Promise<boolean> {
    if (!(await waitWhilePaused())) {
      return false;
    }
    setLang(at);
    setLine(text);
    setChips(chipsNow);
    await say(text, at);
    return alive.current && !paused.current;
  }

  async function watchPhone(): Promise<void> {
    if (!alive.current || paused.current) {
      return;
    }
    await checkPhoneOnce(
      () => {
        void speak(lowBattery[langRef.current], langRef.current);
      },
      () => {
        void speak(phoneHot[langRef.current], langRef.current);
      },
    );
  }

  const langRef = useRef<Language>('en');

  async function run(): Promise<void> {
    try {
      await Font.loadAsync({
        ReadexPro_400Regular,
        ReadexPro_500Medium,
        ReadexPro_600SemiBold,
        ReadexPro_700Bold,
      });
      await initVoice();
      await preparePhone();
      await watchPhone();
      const prefs = await loadPrefs();
      langRef.current = prefs.language;
      const locales = Localization.getLocales();
      const phoneLang = locales[0]?.languageCode?.startsWith('ar')
        ? 'ar'
        : locales[0]?.languageCode?.startsWith('fr')
          ? 'fr'
          : 'en';
      await SplashScreen.hideAsync();
      if (!prefs.firstLaunchDone) {
        await firstLaunch(phoneLang);
        if (!alive.current) {
          return;
        }
        await savePrefs({ language: langRef.current, firstLaunchDone: true });
      }
      setCameraOn(true);
      if (__DEV__) console.log('[ittro] sensors.getStatus:', JSON.stringify(sensorsStatus()));
      await speak(welcome[langRef.current], langRef.current, ['help']);
      flowDone.current = true;
    } catch {
      setLine('Something went wrong starting Ittro. Open it again.');
    }
  }

  async function firstLaunch(phoneLang: Language): Promise<void> {
    await speak(micLine[phoneLang], phoneLang);
    const mic = await requestRecordingPermissionsAsync();
    if (!mic.granted) {
      await speak(refusedMic[langRef.current], langRef.current);
      return;
    }
    const cam = await requestCamera();
    if (!cam.granted) {
      await speak(refusedCamera[langRef.current], langRef.current);
      return;
    }
    await speak(chooseLanguage.en, 'en');
    await speak(chooseLanguage.ar, 'ar');
    await speak(chooseLanguage.fr, 'fr');
    playSound('listening');
    const heard = await listenOnce('en-US', [], speech.firstLaunchListenMs);
    if (/عربي/.test(heard)) {
      langRef.current = 'ar';
    } else if (/fran[çc]ais/i.test(heard)) {
      langRef.current = 'fr';
    } else {
      langRef.current = 'en';
    }
    const at = langRef.current;
    await speak(privacyLine[at], at);
    await speak(buttonsLine[at], at);
    await speak(tourOffer[at], at, at === 'en' ? ['yes', 'no'] : []);
    playSound('listening');
    const answer = await listenOnce(LISTEN_LOCALE[at], [], speech.firstLaunchListenMs);
    if (YES_WORDS[at].some((word) => answer.toLowerCase().includes(word.toLowerCase()))) {
      await soundTour(at);
    }
  }

  async function soundTour(at: Language): Promise<void> {
    const rows: Array<{ sound: 'heard' | 'listening' | 'workingTick' | 'lost' | 'yes' | 'no'; row: number }> = [
      { sound: 'heard', row: 0 },
      { sound: 'listening', row: 1 },
      { sound: 'workingTick', row: 2 },
      { sound: 'lost', row: 3 },
      { sound: 'yes', row: 4 },
      { sound: 'no', row: 5 },
    ];
    for (const item of rows) {
      playSound(item.sound);
      if (!(await speak(tourMeaning[item.row][at], at))) {
        return;
      }
    }
  }

  const rtl = lang === 'ar';

  return (
    <View style={styles.container}>
      {cameraOn ? (
        <CameraView
          style={styles.camera}
          facing="back"
          accessible={false}
          importantForAccessibility="no"
        />
      ) : null}
      <View style={cameraOn ? styles.overlay : styles.plain}>
        <Text
          style={[styles.line, rtl && styles.lineRtl]}
          accessible
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
        >
          {line}
        </Text>
        <View style={styles.chips}>
          {chips.map((chip) => (
            <Text key={chip} style={styles.chip}>
              {chip}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.ink,
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  plain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: size.screenPadding,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 48,
    paddingHorizontal: size.screenPadding,
  },
  line: {
    color: color.paper,
    fontSize: font.spokenLine.size,
    fontFamily: 'ReadexPro_600SemiBold',
    lineHeight: font.spokenLine.size * font.spokenLine.lineHeight,
    textAlign: 'left',
  },
  lineRtl: {
    textAlign: 'right',
    lineHeight: font.spokenLineArabic.size * font.spokenLineArabic.lineHeight,
    fontSize: font.spokenLineArabic.size,
  },
  chips: {
    flexDirection: 'row',
    marginTop: 16,
  },
  chip: {
    color: color.paper,
    fontSize: font.chip.size,
    fontFamily: 'ReadexPro_500Medium',
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: size.panelRadius,
    paddingHorizontal: 16,
    height: font.chip.chipHeight,
    textAlignVertical: 'center',
    marginHorizontal: 6,
  },
});
