# Ittro design assets

The logo, Android icons, colours, type and screen designs for Ittro, the Android app that guides a blind shopper's hand to the right product.

All of this was made on 27 October 2026, the first day of the hackathon's building period. In `docs/BUILD_LOG.md`, log it as design work made during the event, with Claude (Anthropic) as the tool.

Read `DESIGN.md` first. Ittro is **English first, voice only and never silent**: there are no buttons, every word on screen is spoken, and every wait has a sound. DESIGN.md lists the voice commands, the silence budget, the sounds and vibrations, and each screen's spoken line.

## What's here

| Path | What it is | Where it goes in the Expo app |
|---|---|---|
| `android/icon-1024.png` | Full-bleed square icon | `app.json` → `expo.icon` |
| `android/adaptive-foreground-1024.png` | Adaptive icon foreground, transparent, glyph inside the safe zone | `expo.android.adaptiveIcon.foregroundImage`, with `backgroundColor: "#2A62F0"` |
| `android/adaptive-monochrome-1024.png` | Themed-icon layer (Android 13+) | `expo.android.adaptiveIcon.monochromeImage` |
| `android/splash-icon-1024.png` | Rounded logo on transparent | `expo-splash-screen` plugin `image`, with `backgroundColor: "#0B0E13"` and `imageWidth: 200` |
| `android/notification-icon-96.png` | White glyph on transparent | `expo-notifications` plugin `icon`, if notifications are ever used |
| `android/play-store-512.png` | Store listing icon | Play Console, if the app is listed |
| `android/adaptive-preview.png` | How the adaptive icon looks under the circle, squircle and themed masks | Reference only |
| `web/favicon-48.png`, `web/icon-192.png`, `web/icon-512.png` | Icons for the relay's page or a web demo | Optional |
| `logo/*.svg` | Sources of every icon above, on the 108 × 108 adaptive grid | Re-render from these if a size is missing |
| `logo/ittro-wordmark-dark.png`, `-light.png` | Logo and the name "Ittro إيترو" | README header, demo video, slides |
| `tokens/tokens.json` | Colours, verdict colours, type sizes, dimensions, haptic patterns, the silence-budget timings, sound file names | Copy into `src/theme.ts` |
| `sounds/*.wav` | The eleven interface sounds: heard, listening, working tick, lost, proximity tick, helper pulse, pausing, waking, yes, no, not sure (DESIGN.md, "Sounds") | `assets/sounds/`, preloaded at start |
| `voice/SCRIPT.md`, `voice/clips.json` | The 30 fixed spoken cues (directions, reach forward, pick it up, checking, yes, no, hand and phone problems) in English, Arabic and French | Read SCRIPT.md for when each plays |
| `voice/<id>.en.wav`, `voice/<id>.fr.wav` | The English and French cues, recorded with Meta MMS-TTS (16 kHz mono) | `assets/voice/`, preloaded at start; Arabic cues are made on the phone (DESIGN.md, "Voice") |
| `voice/make_voice.py` | Re-records the English and French cues with MMS | Only if a cue changes |
| `sounds/make_sounds.py` | Makes the sounds from scratch with Python alone | Run again if a sound needs changing |
| `screens/00-identity.png` | The identity board and voice rules | Reference only |
| `screens/01-welcome` … `30-shoppinglist` (`.png` and `.html`) | The thirty screens, 390 × 844, rendered at 2× | Build the UI to match |
| `screens/all-screens.png` | All thirty side by side | Reference only |
| `AUDIT.md` | What the two research reports and the test project asked for, and where the design covers it | Read once |

The wordmark SVGs use the Readex Pro font by name. They render correctly only where the font is installed, so use the PNGs elsewhere.

## The screens, in the order the shopper meets them

Each screen is spoken in full the moment it appears.

1. **Welcome**: "Hi, I'm Ittro. Tell me what you're looking for, or say help."
2. **Permissions** (first launch): Ittro explains, then Android asks for the microphone and the camera.
3. **Confirm**: "You asked for Masaad water. Is that right? Say yes or no." Ittro is already looking.
4. **Searching**: the product isn't in view; Ittro says which way to move the phone.
5. **Reading**: SAM 3.1 outlines the products; Muse Spark reads each label.
6. **Guiding**: the target is outlined in green; Ittro says which way to move the hand, then short recorded cues ("A little to your right.").
7. **Wrong**: red. Ittro says what is in the hand and where the right one is.
8. **Not sure**: amber. Ittro says what it could read and what it couldn't.
9. **Found**: green. Every attribute asked for is checked and said.
10. **Picture problem**: the picture is blurred, dark or glaring; Ittro says what to do with the phone.
11. **Details**: say "read the date" (or size, price, ingredients); exact text only.
12. **Help**: say "help" to hear the commands for this moment.
13. **Language**: say "speak Arabic" (or French); say "English" to come back.
14. **Earbud button**: once yes, twice no, hold stop; said when earbuds connect.
15. **Add a helper**: a spoken six-digit code the helper types on their own phone.
16. **Ask a person**: "ask someone"; Ittro confirms before sending the picture.
17. **Waiting**: ticks, then a soft pulse and an update every 30 s.
18. **The person answered**: the helper's verdict, said, shown and felt.
19. **The helper's page**: the web page the helper answers from (not part of the app).
20. **Choose a language** (first launch): "I speak English." Then, in Arabic and in French, how to switch.
21. **Language offer**: the shopper spoke Arabic; Ittro asks in Arabic whether to switch.
22. **How to hold the phone**: taught after the first "yes", and whenever no shelf is in view.
23. **Reach forward**: the fingertip covers the product in the picture but hasn't touched it.
24. **Sound tour**: what each sound means; offered on first launch.
25. **Welcome back**: after a call, a lock or another app's sound.
26. **Paused**: 2 minutes after done or stop.
27. **Close alternative**: the size asked for is sold out; Ittro offers the one that's there.
28. **Wrong shelf**: nothing of the kind is in view; ask staff or a helper.
29. **Several matches**: guides to the nearest and says how many.
30. **Shopping list**: several products, found one after another.

## Rules for using these files

- Copy the files you need into the repository (for example `assets/`). Don't link to this folder from the app's code.
- Don't change the logo's shape or colours. If a size is missing, render it from the SVG.
- The bottles and labels in the screens are drawings for layout only. The real app shows the live camera.

## Licences

The English and French voice is Meta's MMS-TTS (`facebook/mms-tts-eng`, `facebook/mms-tts-fra`), licensed CC BY-NC 4.0: non-commercial use, with credit to Meta. Keep this credit in the app's README and licence notes.
