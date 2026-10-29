# Cerebral Valley submission text (founder pastes and submits)

One section per form field. Replace every [BRACKET] placeholder
before submitting. Nothing here is submitted until the founder
pastes it into the form.

## Project name

Ittro

## One-liner

A voice-only Android companion that finds the exact product on the shelf, guides a blind shopper's hand to it, and confirms it in the hand before saying yes.

## What it does

The shopper says what they want in English, Arabic or French. Ittro
outlines every product on the shelf, reads the labels, steers the
reaching hand with spoken cues, sounds and vibration, and confirms
the held product before saying yes. A wrong "yes" is the worst
outcome, so "I can't confirm yet" always beats a guess: every asked
attribute must be read and matched. There are no buttons on screen;
every word shown is spoken. If Ittro can't settle it, the shopper
can ask a helper, who answers from a web page with no install.

## How Meta AI is used

- Muse Voice Transcribe streams the always-on microphone through the relay, biased to English, Arabic and French.
- Muse Spark understands every request and command, picks the package word, reads shelf labels, classifies scenes, confirms the held product and reads dates, sizes, prices and ingredients word for word — all with strict structured output.
- SAM 3.1 outlines the products; masks reach the phone as small polygons parsed with Meta's @meta-sam/parser.
- MMS-TTS voices Ittro: the 30 fixed English and French cues are MMS recordings shipped with the app.

Only the relay calls Meta; the phone never holds the API key.

## Demo video

[VIDEO LINK — paste the final link after the logged-out play check in docs/submission-checklist.md]

One real search end to end: ask, confirm, guide, a wrong bottle
caught ("No. This is Guedila water."), the right one confirmed,
and a switch to Arabic. Filmed on a real phone in a real shop.

## Repository

https://github.com/AmineYagoub/ittro (public; MIT; MMS-TTS credit CC BY-NC 4.0; SAM License copy at relay/licenses/SAM-License.txt)

## What we proved

[PHONE NUMBERS — paste after the runs in docs/measure.md: 20-minute session drain/heat/memory; 10-product set found count, wrong-yes count (target 0), verdict times.]

Mac proof at submission: 227 app tests and 84 relay tests pass,
typecheck and all lints clean, debug APK builds; live Meta calls
through the real relay (42/42 understanding cases, in-hand yes/no/
unsure verdicts on label crops, tracked SAM masks over shelf pans).

## Track

Indie.
