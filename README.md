# Ittro

Ittro is an Android shopping companion for blind and low-vision shoppers. The shopper says what they want; Ittro finds that exact product on the shelf through the camera, guides the shopper's hand to it by voice and vibration, and confirms the product in the hand before saying yes.

A wrong "yes" is the worst outcome. "I can't confirm yet" is always better than a guess, so every attribute asked for must be read and matched before Ittro says yes.

Ittro is our entry for the Meta Global AI Developer Hackathon (Indie track). The demo is English-first; Arabic and French are one spoken command away. Voice only: no buttons on screen, every word on screen is spoken, never silent, never chatty.

## How each Meta model is used

Four Meta models, each doing one job. The phone never holds the Meta API key: the app talks to a small relay, and only the relay calls Meta.

| Model | Where | What it does |
|---|---|---|
| Muse Voice Transcribe | Relay `/realtime` stream, always on | Hears every sentence, biased to English, Arabic and French from the first second |
| Muse Spark | Relay, strict structured output on every call | Understands requests and commands (`/understand`); finds the requested product in the shelf photo and boxes each matching package with the name printed on it (`/find`); answers questions about the view and names the shelf (`/ask-view`, `/classify-scene`); confirms the product in the hand (`/confirm-hand`); reads details word for word (`/read-detail`) |
| SAM 3.1 | Relay `/find` | Cuts each package Spark boxed into a mask; masks are parsed with Meta's `@meta-sam/parser`, traced into polygons of up to 160 points with torn rows mended, and drawn natively on the phone, which keeps the outline on the product as the phone turns and steps closer and as the hand covers it |
| MMS-TTS | On the phone | The 30 fixed direction and verdict cues in English and French are MMS recordings (`facebook/mms-tts-eng`, `facebook/mms-tts-fra`) shipped with the app and starting in under 50 ms |

Honest notes: sentences with names and label text are spoken by the phone's voice, as is all Arabic, so English and French switch voices between a cue and a sentence; the on-device MMS synthesis runner was attempted during the event but never finished. Hand tracking (MediaPipe, on the phone) is not a Meta model. A relay answer counts only when it completed and parses; anything else is an error, never an empty default.

## What was built, and what the Meta models do

The shopper is on the left; green is what was built during the hackathon; blue are the Meta models it uses. The existing tools underneath are listed below the diagram. Each piece is dated in the [build log](docs/BUILD_LOG.md). The build log also has [the full map](docs/BUILD_LOG.md#the-whole-system), including the sighted helper and the phone's own voice.

```mermaid
flowchart LR
  shopper(["<b>Shopper</b><br/>blind or low vision"])
  subgraph built["Built during the hackathon"]
    app["<b>Ittro app</b><br/>on&nbsp;the&nbsp;phone<br/><div style='text-align:left'>•&nbsp;voice&nbsp;conversation<br/>•&nbsp;hand&nbsp;guidance<br/>•&nbsp;outline&nbsp;tracking</div>"]
    relay["<b>Relay</b><br/>on&nbsp;Cloudflare&nbsp;Workers<br/><div style='text-align:left'>•&nbsp;access&nbsp;gate<br/>•&nbsp;find&nbsp;and&nbsp;confirm<br/>•&nbsp;mask&nbsp;tracing</div>"]
  end
  subgraph api["Meta Model API"]
    asr["<b>Muse Voice Transcribe</b><br/>hears the shopper"]
    spark["<b>Muse Spark</b><br/>finds the product<br/>checks the label"]
    sam["<b>SAM 3.1</b><br/>outlines each package"]
  end
  subgraph open["Meta open-weights model"]
    mms["<b>Meta MMS-TTS</b><br/>recorded guide cues"]
  end
  mms -->|"cues"| app
  shopper <-->|"voice, camera /<br/>guidance, vibration"| app
  app <-->|"speech, photos /<br/>outlines"| relay
  relay --> asr
  relay --> spark
  relay --> sam
  classDef person fill:#FEF3C7,stroke:#B45309,color:#451A03
  classDef built fill:#DCFCE7,stroke:#15803D,color:#052E16
  classDef model fill:#DBEAFE,stroke:#1D4ED8,color:#172554
  class shopper person
  class app,relay built
  class asr,spark,sam,mms model
  style built fill:#F0FDF4,stroke:#15803D
  style api fill:#EFF6FF,stroke:#1D4ED8
  style open fill:#EFF6FF,stroke:#1D4ED8
```

Built on: [Expo](https://expo.dev) and React Native, [MediaPipe](https://ai.google.dev/edge/mediapipe)'s hand model, [Cloudflare Workers](https://workers.cloudflare.com), Meta's [`@meta-sam/parser`](relay/licenses/SAM-License.txt) and MMS voices, the Readex Pro font, and the djazairdev project template.

## Architecture

One XState statechart runs the app. `live` holds seven parallel regions; `paused` (call, lock, another app) and `over` sit beside it.

```text
conversation
├── live (parallel)
│   ├── talk:    boot → first-launch → saying ⇄ listening
│   │            → speculating / understanding → routing
│   │            (sleeping, touring, pairing, sending)
│   ├── silence: quiet → waiting → reminding (8 s, 20 s, 60 s)
│   ├── search:  idle ⇄ active (starts as soon as one clear product is asked for)
│   ├── guide:   idle → aiming → directing → almost → reaching → picking
│   │            (noHand, handLost, wrongItem, targetLost)
│   ├── confirm: idle → checking → yes / no / unsure / picture / giveup
│   │            (readingDetail → detail)
│   ├── helper:  idle → pairing → waiting → waitingLate → answered
│   └── link:    ok / down / limited / broken (each said once, self-healing)
├── paused → "Welcome back. Still looking for …"
└── over   → "Say Ittro when you need me."
```

Around it: the relay (Cloudflare Worker: strict Spark gate, rate limit, daily spending limit, helper pairing and the helper page), and the `ittro-sensors` native module (24 kHz mic stream, live camera frames for hand tracking, earbud and volume-down buttons, photo prep). The full spec is [docs/design/DESIGN.md](docs/design/DESIGN.md); the screens it names are in [docs/design/screens](docs/design/screens).

Targets: first outline under 3 s after the request, the right product in the hand under 30 s, a verdict about 3 s after the hand stops.

Phone numbers (fill after the phone runs, never invent): 20-minute session drain/heat/memory — _pending_; 10-product set found/wrong-yes/verdicts — _pending_. Procedure: [docs/measure.md](docs/measure.md). Demo script: [docs/demo-script.md](docs/demo-script.md).

## How to run it

```bash
git clone https://github.com/AmineYagoub/ittro
cd ittro/app && npm install && npx tsc --noEmit && npm run lint && npm test
cd ../relay && npm install && npm test && npm run typecheck && npm run lint
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
- 30 Oct: fixes from the first phone runs: each line said once, Ittro never answers its own voice, the found product announced by name at once, only the found product outlined, label reads at minimal effort.
- 31 Oct: an outside reviewer's commit (mic muted while Ittro speaks, one guide target, deadlines on every call); the target kept by what it reads; a clear request searched at once; the touch on the guided product starts the check.
- 1 Nov: SAM's own outline drawn natively and following the camera, a 4:3 preview, finer outlines; reflections never the product; the last shelf read again at once for the next request; a named variety must be the one on the label.
- 1 Nov, evening: the grounding find (Spark boxes each matching package, SAM cuts each box); questions about the shelf answered on the spot; the shelf named in the shopper's language, and a wrong shelf says so; a sweep that remembers what each stop read.
- 2 Nov: fixes from phone tests t21–t44: the plain mic, so Ittro keeps hearing; the outline moves with the phone's turn from the gyroscope while a hand is in view, grows and shrinks as the phone steps closer, and holds while the hand reaches; it is cut again while the phone moves; the relay mends SAM's torn mask rows; the relay is type-checked.
- 3 Nov: CI on every pull request (tests and a fresh Android build), release-please versions, and the first signed release, v0.1.0, built and published by CI.

Not built here (tools and materials, not the entry): the project template, the Expo starter, npm libraries, the Android SDK, Meta's models and MMS voices, the Readex Pro font, pre-event research, `@meta-sam/parser`, MediaPipe and its hand model. See "Not built during the event" in [docs/BUILD_LOG.md](docs/BUILD_LOG.md).

## Licence

[MIT](LICENSE).

Third-party, with thanks: Meta MMS-TTS voices (`facebook/mms-tts-eng`, `facebook/mms-tts-fra`) are licensed CC BY-NC 4.0: non-commercial use, credit to Meta. Meta's `@meta-sam/parser` (0.1.0) is under the SAM License; the full text ships at [relay/licenses/SAM-License.txt](relay/licenses/SAM-License.txt). Hand tracking runs on Google's MediaPipe Tasks vision library (Apache 2.0) with the `hand_landmarker` model; fetch it with `node app/scripts/fetch-hand-model.mjs`.
