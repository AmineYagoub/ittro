// Ittro: permissions, then the spoken conversation. One statechart
// owns listening, understanding, pausing and the silence timers;
// this screen only shows what it says.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { IttroCameraView, takeCameraShot } from 'ittro-sensors';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as Font from 'expo-font';
import { ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import * as SplashScreen from 'expo-splash-screen';
import { createActor } from 'xstate';
import * as Localization from 'expo-localization';
import { initVoice, say, setSpeechRate, stopVoice } from './src/speech';
import { logIttro } from './src/log';
import { loadPrefs, loadSnapshot } from './src/store';
import { relayConfig } from './src/relay';
import { preparePhone, restPhone, watchAppState } from './src/phone';
import { startPhoneWatch, trackState } from './src/phoneWatch';
import { conversationMachine } from './src/conversation/machine';
import { useShelfSearch } from './src/shelf/useShelfSearch';
import { GuideOverlay } from './src/guide/GuideOverlay';
import { useGuide } from './src/guide/useGuide';
import type { ShelfOutline } from './src/relay';
import type { GuideHand, HelperPairing, HelperWaiting } from './src/conversation/types';
import { HelperView } from './src/helper/HelperView';
import { micLine, refusedCamera, refusedMic } from './src/lines';
import type { Language } from './src/theme';
import { styles } from './src/appStyles';
import { useConfirm } from './src/confirm/useConfirm';
import { useButtons } from './src/useButtons';
import { DetailCrop, VerdictScreen } from './src/confirm/VerdictView';
import { verdictWord } from './src/confirm/lines';
import type { DetailKind } from './src/relay';

void SplashScreen.preventAutoHideAsync();

type ConversationActor = ReturnType<typeof createActor<typeof conversationMachine>>;

export default function App(): React.JSX.Element {
  const [line, setLine] = useState('…');
  const [chips, setChips] = useState<string[]>([]);
  const [lang, setLang] = useState<Language>('en');
  const [cameraOn, setCameraOn] = useState(false);
  const [talkBack, setTalkBack] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchRequest, setSearchRequest] = useState<string | null>(null);
  const [guiding, setGuiding] = useState(false);
  const [guideTarget, setGuideTarget] = useState<ShelfOutline | null>(null);
  const [guideHand, setGuideHand] = useState<GuideHand | null>(null);
  const [guideProximity, setGuideProximity] = useState(0);
  const [guideCue, setGuideCue] = useState<string | null>(null);
  const [guideLabel, setGuideLabel] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [verdict, setVerdict] = useState<'yes' | 'no' | 'unsure' | 'picture' | null>(null);
  const [confirmLabel, setConfirmLabel] = useState('');
  const [confirmCrop, setConfirmCrop] = useState<string | null>(null);
  const [detailKind, setDetailKind] = useState<DetailKind | null>(null);
  const [helper, setHelper] = useState<{ pairing: HelperPairing | null; waiting: HelperWaiting | null; verdict: 'yes' | 'no' | 'unsure' | null; label: string; photo: string | null }>(
    { pairing: null, waiting: null, verdict: null, label: '', photo: null },
  );
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const [, requestCamera, getCameraPermission] = useCameraPermissions();
  const actorRef = useRef<ConversationActor | null>(null);
  const cameraRef = useRef({ takeShot: takeCameraShot });
  const cameraReady = useRef(false);
  const inLive = useRef(false);

  const guide = useGuide(actorRef, cameraOn);
  const search = useShelfSearch(cameraRef, actorRef, searching, searchRequest, cameraReady, guide);
  useConfirm(cameraRef, actorRef, confirming, searchRequest, cameraReady);
  useButtons(actorRef);

  useEffect(() => {
    cameraReady.current = false;
  }, [cameraOn]);

  useEffect(() => {
    let gone = false;
    void run();
    const unwatch = watchAppState(
      () => actorRef.current?.send({ type: 'PAUSE' }),
      () => actorRef.current?.send({ type: 'RESUME' }),
    );
    const talkSub = AccessibilityInfo.addEventListener('screenReaderChanged', setTalkBack);
    const unwatchPhone = startPhoneWatch({
      sendAlert: (kind, text) => actorRef.current?.send({ type: 'ALERT', kind, text }),
      lang: () => actorRef.current?.getSnapshot().context.lang ?? 'en',
    });
    return () => {
      gone = true;
      unwatch();
      talkSub.remove();
      unwatchPhone();
      restPhone();
      stopVoice();
      actorRef.current?.stop();
      actorRef.current = null;
    };

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
        logIttro(`relay ${JSON.stringify({ url: relay.url })}`);
        const actor = createActor(conversationMachine, {
          input: { prefs, snapshot, relayUrl: relay.url, relayCode: relay.accessCode },
        });
        actorRef.current = actor;
        const track = trackState();
        actor.subscribe((state) => {
          track(state.value);
          const live = state.value !== 'paused' && state.value !== 'over';
          setLine(state.context.lastLine || '…');
          setChips(state.context.lastChips);
          setLang(state.context.lang);
          setCameraOn(live && state.context.cameraOn);
          setSearching(live && state.context.searching);
          setSearchRequest(state.context.pendingRequest ?? state.context.request);
          setGuiding(live && state.context.guiding);
          setGuideTarget(live ? state.context.guideTarget : null);
          setGuideHand(live ? state.context.guideHand : null);
          setGuideProximity(state.context.guideProximity);
          setGuideCue(state.context.guideCue);
          setGuideLabel(state.context.guideLabel);
          setConfirming(live && state.context.confirming);
          setVerdict(live ? state.context.confirmVerdict : null);
          setConfirmLabel(state.context.confirmLabel);
          setConfirmCrop(live ? state.context.confirmCrop : null);
          setDetailKind(live ? state.context.confirmDetailKind : null);
          setHelper({
            pairing: live ? state.context.pairing : null,
            waiting: live ? state.context.waiting : null,
            verdict: live ? state.context.helperVerdict : null,
            label: state.context.helperLabel,
            photo: live ? state.context.sentPhoto : null,
          });
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
  const shown = verdict === 'yes' || verdict === 'no' || verdict === 'unsure' ? verdict : null;
  const helperShown = !shown && helper.verdict ? helper.verdict : null;
  const helperCard = !shown && !helperShown && (helper.pairing || helper.waiting);
  const detailShown = !shown && !helperShown && detailKind !== null && confirmCrop !== null;

  function measured(event: LayoutChangeEvent): void {
    const { width, height } = event.nativeEvent.layout;
    setViewSize((before) => (before.width === width && before.height === height ? before : { width, height }));
  }

  return (
    <View style={styles.container} onLayout={measured}>
      {cameraOn && IttroCameraView ? (
        <IttroCameraView
          active
          style={styles.camera}
          accessible={false}
          importantForAccessibility="no"
          onCameraReady={() => {
            cameraReady.current = true;
          }}
          onHandFrame={(event) => guide.onHandFrame(event.nativeEvent)}
          onTrackPan={(event) => search.onTrackPan(event.nativeEvent)}
          onCameraError={(event) => {
            cameraReady.current = false;
            logIttro(`camera error: ${event.nativeEvent.message}`);
          }}
        />
      ) : null}
      {cameraOn && guiding && guideTarget && viewSize.width > 0 ? (
        <GuideOverlay
          target={guideTarget}
          hand={guideHand}
          proximity={guideProximity}
          cue={guideCue}
          label={guideLabel}
          width={viewSize.width}
          height={viewSize.height}
        />
      ) : null}
      {shown || helperShown ? (
        <VerdictScreen
          verdict={(shown ?? helperShown) as 'yes' | 'no' | 'unsure'}
          word={verdictWord((shown ?? helperShown) as 'yes' | 'no' | 'unsure', lang)}
          label={shown ? confirmLabel : helper.label}
          crop={shown ? confirmCrop : helper.photo}
          line={line}
          chips={chips}
          rtl={rtl}
          talkBack={talkBack}
        />
      ) : helperCard ? (
        <HelperView
          code={helper.pairing?.code ?? null}
          waiting={helper.waiting?.helpers ?? null}
          line={line}
          chips={chips}
          rtl={rtl}
          talkBack={talkBack}
          cameraOn={cameraOn}
        />
      ) : (
        <View style={cameraOn ? styles.overlay : styles.plain}>
          {detailShown && confirmCrop ? <DetailCrop crop={confirmCrop} /> : null}
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
              <Text key={chip} style={styles.chip}>{chip}</Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

