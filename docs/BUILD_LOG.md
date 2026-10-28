# Ittro build log

A dated log of what was built each day, for the hackathon submission. New work only: everything here dates from 26 October 2026 onward.

## 27 October 2026

- Created [AmineYagoub/ittro](https://github.com/AmineYagoub/ittro) from `djazairdev/project-template`. First commit is the template only.
- Adopted the template: README from `README.template.md`, slugs replaced, `.gitignore` covers secrets and `/reports/`.
- Scaffolded `app/` (Expo, TypeScript, `dev.ittro.app`): camera screen, debug APK built locally, opened on the real phone over wireless adb with a live camera view. No emulators used.
- Scaffolded `modules/ittro-sensors/` (Kotlin skeleton: owned buffers, frame IDs). Not wired yet.
- Built `relay/` (Cloudflare Worker): strict Spark `json_schema` gate, unit tests 5/5, end-to-end probe through the Worker handler passes. Not deployed.
- Converted all sources to TypeScript. Toolchain pinned to TypeScript 6 (no parser supports TypeScript 7 yet); all code stays erasable-only and TS7-ready.
- Configured ESLint 9 in `app/`, `relay/`, `modules/ittro-sensors/`, with the 300-line limit. All clean.
- Design pack landed in `docs/design/`: DESIGN.md, AUDIT.md, 31 screens with layouts, tokens, 11 sounds, 30 trilingual voice cues (English and French recorded with MMS-TTS; Arabic generated on-device). Made 27 October with Claude as the tool.
- Reviewed the design pack; licence credit and demo-scope notes added to the README.

## Not built during the event

For the new-work rule: everything above was made 26 October 2026 onward. The following predate the event or came from outside it, and are tools and materials, not the entry.

- `djazairdev/project-template` files (MIT): repo scaffolding only (readme shape, contributing guides, governance, licence text). No product behaviour.
- Expo blank-app starter: replaced file by file (TypeScript sources, camera screen, config). Only the build wiring remains.
- Libraries, installed from npm, not written here: `expo`, `react-native`, `react`, `expo-camera`, `typescript`, `eslint`, `typescript-eslint`. See each folder's `package.json` and lockfile.
- Build tooling: Android SDK, Gradle, JDK. Nothing of theirs ships in the repo.
- Meta's models, called through the Model API, and Meta MMS-TTS voices (CC BY-NC 4.0) used to record the English and French cues. Recordings were made 27 October; the models themselves are Meta's.
- Readex Pro font (OFL-1.1) named by the design; the app does not bundle it yet.
- Research results R1 and R2 (22 October) and the 22–26 October test project: read as background, referenced by `docs/design/AUDIT.md`. None of their code entered this repository.

## Build order

1. English voice path with recorded clips (demo speaks English only).
2. Relay speculative search: look while confirming, freshness-checked answers.
3. On-device TTS evaluation (MMS-TTS via ONNX on the phone, day-1 test; fallback is the phone's voice), then French, then Arabic.
4. Native controls: earbud media session, volume-down hold, TalkBack path selection, barge-in echo test.
5. Helper system: pairing codes, photo store with expiry, helper web page, answers back to the phone.

## Open at build start (unresolved, do not guess)

- Commercial versus non-commercial: the MMS voices are CC BY-NC 4.0. Replacing them or accepting non-commercial is the founder's call.
- Helper system: build as phase 5 or cut from the demo. The demo needs no helper; screens 15–19 stay design-only until decided.
- TalkBack announcements versus Ittro's own voice: day-1 test decides.
- Barge-in: needs proven echo cancellation; until then short lines plus the listening sound.
