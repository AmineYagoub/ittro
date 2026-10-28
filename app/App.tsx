// Ittro: permissions, then the spoken conversation. One statechart
// owns listening, understanding, pausing and the silence timers;
// this screen only shows what it says.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as Font from 'expo-font';
import { ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import * as SplashScreen from 'expo-splash-screen';
import { createActor } from 'xstate';
import * as Localization from 'expo-localization';
import { initVoice, say, setSpeechRate, stopVoice } from './src/speech';
import { loadPrefs, loadSnapshot } from './src/store';
import { relayConfig } from './src/relay';
import { batteryLow, phoneHot, preparePhone, restPhone, watchAppState } from './src/phone';
import { conversationMachine } from './src/conversation/machine';
import { OutlineOverlay } from './src/shelf/OutlineOverlay';
import { useShelfSearch } from './src/shelf/useShelfSearch';
import type { ShelfOutline } from './src/relay';
import { lowBattery, micLine, phoneHot as phoneHotLine, refusedCamera, refusedMic } from './src/lines';
import { color, font, size } from './src/theme';
import type { Language } from './src/theme';

void SplashScreen.preventAutoHideAsync();

type ConversationActor = ReturnType<typeof createActor<typeof conversationMachine>>;

export default function App(): React.JSX.Element {
  const [line, setLine] = useState('…');
  const [chips, setChips] = useState<string[]>([]);
  const [lang, setLang] = useState<Language>('en');
  const [cameraOn, setCameraOn] = useState(false);
  const [talkBack, setTalkBack] = useState(false);
  const [outlines, setOutlines] = useState<ShelfOutline[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchRequest, setSearchRequest] = useState<string | null>(null);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [, requestCamera, getCameraPermission] = useCameraPermissions();
  const actorRef = useRef<ConversationActor | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const cameraReady = useRef(false);
  const inLive = useRef(false);

  useShelfSearch(cameraRef, actorRef, searching, searchRequest, cameraReady);

  useEffect(() => {
    let gone = false;
    void run();
    const unwatch = watchAppState(
      () => actorRef.current?.send({ type: 'PAUSE' }),
      () => actorRef.current?.send({ type: 'RESUME' }),
    );
    const talkSub = AccessibilityInfo.addEventListener('screenReaderChanged', setTalkBack);
    const checker = setInterval(() => void watchPhone(), 60000);
    return () => {
      gone = true;
      unwatch();
      talkSub.remove();
      clearInterval(checker);
      restPhone();
      stopVoice();
      actorRef.current?.stop();
      actorRef.current = null;
    };

    async function watchPhone(): Promise<void> {
      const actor = actorRef.current;
      if (!actor) {
        return;
      }
      const at = actor.getSnapshot().context.lang;
      if (await batteryLow()) {
        actor.send({ type: 'ALERT', kind: 'battery', text: lowBattery[at] });
      }
      if (phoneHot()) {
        actor.send({ type: 'ALERT', kind: 'heat', text: phoneHotLine[at] });
      }
    }

    async function run(): Promise<void> {
      try {
        await Font.loadAsync({
          ReadexPro_400Regular,
          ReadexPro_500Medium,
          ReadexPro_600SemiBold,
          ReadexPro_700Bold,
        });
        await initVoice();
        setTalkBack(await AccessibilityInfo.isScreenReaderEnabled());
        await preparePhone();
        const prefs = await loadPrefs();
        setSpeechRate(prefs.rate);
        const locales = Localization.getLocales();
        const phoneLang = locales[0]?.languageCode?.startsWith('ar')
          ? 'ar'
          : locales[0]?.languageCode?.startsWith('fr')
            ? 'fr'
            : 'en';
        const micNow = await getRecordingPermissionsAsync();
        const camNow = await getCameraPermission();
        await SplashScreen.hideAsync();
        if (gone) {
          return;
        }
        if (!micNow.granted || !camNow.granted) {
          setLang(phoneLang);
          setLine(micLine[phoneLang]);
          void say(micLine[phoneLang], phoneLang);
        }
        const mic = await requestRecordingPermissionsAsync();
        const cam = camNow.granted ? { granted: true } : await requestCamera();
        if (gone) {
          return;
        }
        if (!mic.granted) {
          setLang(prefs.language);
          setLine(refusedMic[prefs.language]);
          return;
        }
        if (!cam.granted) {
          setLang(prefs.language);
          setLine(refusedCamera[prefs.language]);
          return;
        }
        const snapshot = await loadSnapshot();
        const relay = relayConfig();
        if (__DEV__) console.log('[ittro] relay:', JSON.stringify({ url: relay.url }));
        const actor = createActor(conversationMachine, {
          input: { prefs, snapshot, relayUrl: relay.url, relayCode: relay.accessCode },
        });
        actorRef.current = actor;
        actor.subscribe((state) => {
          const live = state.value !== 'paused' && state.value !== 'over';
          setLine(state.context.lastLine || '…');
          setChips(state.context.lastChips);
          setLang(state.context.lang);
          setCameraOn(live && state.context.cameraOn);
          setOutlines(live ? state.context.outlines : []);
          setSearching(live && state.context.searching);
          setSearchRequest(state.context.pendingRequest ?? state.context.request);
          if (live && !inLive.current) {
            inLive.current = true;
            void preparePhone();
          }
          if (!live && inLive.current) {
            inLive.current = false;
            restPhone();
          }
        });
        actor.start();
      } catch {
        setLine('Something went wrong starting Ittro. Open it again.');
      }
    }
  }, []);

  const rtl = lang === 'ar';

  function measured(event: LayoutChangeEvent): void {
    const { width, height } = event.nativeEvent.layout;
    setViewSize((before) => (before.width === width && before.height === height ? before : { width, height }));
  }

  return (
    <View style={styles.container} onLayout={measured}>
      {cameraOn ? (
        <CameraView
          ref={(view) => {
            cameraRef.current = view;
            if (!view) {
              cameraReady.current = false;
            }
          }}
          style={styles.camera}
          facing="back"
          accessible={false}
          importantForAccessibility="no"
          onCameraReady={() => {
            cameraReady.current = true;
          }}
        />
      ) : null}
      {cameraOn && outlines.length > 0 && viewSize.width > 0 ? (
        <OutlineOverlay outlines={outlines} width={viewSize.width} height={viewSize.height} />
      ) : null}
      <View style={cameraOn ? styles.overlay : styles.plain}>
        <Text
          style={[styles.line, rtl && styles.lineRtl]}
          accessible
          accessibilityRole="text"
          accessibilityLiveRegion={talkBack ? 'none' : 'polite'}
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
