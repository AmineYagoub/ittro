# Ittro

Ittro is an Android shopping companion for blind and low-vision shoppers. The shopper says what they want; Ittro finds that exact product on the shelf through the camera, guides the shopper's hand to it by voice and vibration, and confirms the product in the hand before saying yes.

A wrong "yes" is the worst outcome. "I can't confirm yet" is always better than a guess, so every attribute asked for must be read and matched before Ittro says yes.

Ittro is our entry for the Meta Global AI Developer Hackathon (Indie track). The demo is English-first; Arabic and French are one spoken command away. Voice only: no buttons on screen, every word on screen is spoken, never silent, never chatty.

## How each Meta model is used

Four Meta models, each doing one job. The phone never holds the Meta API key: the app talks to a small relay, and only the relay calls Meta.

| Model | Where | What it does |
|---|---|---|
| Muse Voice Transcribe | Relay `/realtime` stream, always on | Hears every sentence, biased to English, Arabic and French from the first second |
| Muse Spark | Relay, strict structured output on every call | Understands requests and commands (`/understand`), picks the package word (`/package-phrase`), reads shelf labels (`/read-shelf`), classifies scenes (`/classify-scene`), confirms the held product (`/confirm-hand`), reads details word for word (`/read-detail`) |
| SAM 3.1 | Relay `/outline` | Outlines every product on the shelf; masks ship to the phone as small polygons parsed with Meta's `@meta-sam/parser` |
| MMS-TTS | On the phone | The 30 fixed direction and verdict cues in English and French are MMS recordings (`facebook/mms-tts-eng`, `facebook/mms-tts-fra`) shipped with the app and starting in under 50 ms |

Honest notes: sentences with names and label text are spoken by the phone's voice, as is all Arabic; the on-device MMS synthesis runner was attempted during the event but never finished. Hand tracking (MediaPipe, on the phone) is not a Meta model. A relay answer counts only when it completed and parses; anything else is an error, never an empty default.

## Architecture

One XState statechart runs the app. `live` holds seven parallel regions; `paused` (call, lock, another app) and `over` sit beside it.

```text
conversation
├── live (parallel)
│   ├── talk:    boot → first-launch → saying ⇄ listening
│   │            → speculating / understanding → routing
│   │            (sleeping, touring, pairing, sending)
│   ├── silence: quiet → waiting → reminding (8 s, 20 s, 60 s)
│   ├── search:  idle ⇄ active (starts while Ittro asks "Is that right?")
│   ├── guide:   idle → aiming → directing → almost → reaching → picking
│   │            (noHand, handLost, wrongItem, targetLost)
│   ├── confirm: idle → checking → yes / no / unsure / picture / giveup
│   │            (readingDetail → detail)
│   ├── helper:  idle → pairing → waiting → waitingLate → answered
│   └── link:    ok / down / limited / broken (each said once, self-healing)
├── paused → "Welcome back. Still looking for …"
└── over   → "Say Ittro when you need me."
```

Around it: the relay (Cloudflare Worker: strict Spark gate, rate limit, $3/day budget, helper pairing and the helper page), and the `ittro-sensors` native module (24 kHz mic stream, live camera frames for hand tracking, earbud and volume-down buttons, photo prep). The full spec is [docs/design/DESIGN.md](docs/design/DESIGN.md); the screens it names are in [docs/design/screens](docs/design/screens).

Targets: first outline under 3 s after "yes", the right product in the hand under 30 s, a verdict about 3 s after the hand stops.

Phone numbers (fill after the phone runs, never invent): 20-minute session drain/heat/memory — _pending_; 10-product set found/wrong-yes/verdicts — _pending_. Procedure: [docs/measure.md](docs/measure.md). Demo script: [docs/demo-script.md](docs/demo-script.md).

## How to run it

```bash
git clone https://github.com/AmineYagoub/ittro
cd ittro/app && npm install && npx tsc --noEmit && npm run lint && npm test
cd ../relay && npm test && npm run lint
cd ../modules/ittro-sensors && npm run lint
```

Build the debug APK (offline-friendly):

```bash
cd app/android && ./gradlew assembleDebug -x lint
```

Run the relay locally:

```bash
cd relay && printf 'META_API_KEY="…"\nAPP_ACCESS_CODE="…"\n' > .dev.vars  # gitignored
npm run dev  # needs wrangler installed; ask before installing anything
```

Secrets live only in `relay/.dev.vars` (gitignored) or `wrangler secret put`: `META_API_KEY` and `APP_ACCESS_CODE`. The app needs the access code to reach the relay; deploying the relay and creating the `ITTRO_HELPERS` KV namespace are the maintainer's call (see [docs/measure.md](docs/measure.md#deploy-note-the-helper-store)). Test on a real phone over wireless adb, never the emulators.

## What was built during the event

New work only, 26 October 2026 onward; the dated log is [docs/BUILD_LOG.md](docs/BUILD_LOG.md):

- 27 Oct: repo from template, Expo app with camera screen, Kotlin sensor skeleton, relay with strict Spark gate, trilingual design pack (31 screens, 11 sounds, 30 voice cues).
- 28 Oct: spoken conversation as one statechart, proven on the real phone; realtime Voice Transcribe streaming; silence clock, epoch stale-guards, language switching; shelf search (SAM outlines, label reads, tracker, masks); background-talk ignore; re-say of dropped lines.
- 29 Oct: lone product names always answered; hand guiding from live camera frames with clips, ticks and meter; in-hand confirm with yes/no/unsure/picture verdicts and word-for-word detail reads; earbud and volume buttons; helper pairing, asking and answers; link states, brand memory, per-search timing logs and the phone measurement procedure.

Not built here (tools and materials, not the entry): the project template, the Expo starter, npm libraries, the Android SDK, Meta's models and MMS voices, the Readex Pro font, pre-event research, `@meta-sam/parser`, MediaPipe and its hand model. See "Not built during the event" in [docs/BUILD_LOG.md](docs/BUILD_LOG.md).

## Licence

[MIT](LICENSE).

Third-party, with thanks: Meta MMS-TTS voices (`facebook/mms-tts-eng`, `facebook/mms-tts-fra`) are licensed CC BY-NC 4.0: non-commercial use, credit to Meta. Meta's `@meta-sam/parser` (0.1.0) is under the SAM License; the full text ships at [relay/licenses/SAM-License.txt](relay/licenses/SAM-License.txt). Hand tracking runs on Google's MediaPipe Tasks vision library (Apache 2.0) with the `hand_landmarker` model; fetch it with `node app/scripts/fetch-hand-model.mjs`.
