# Ittro design spec

Ittro is used by people who can't see the screen. So the design starts from what the shopper **hears**; the screen mirrors the voice for low-vision shoppers, helpers standing nearby and the judges watching the demo.

The phone is 390 × 844 points in these screens. Values are density-independent points (dp on Android, plain numbers in React Native). `AUDIT.md` lists the research findings and test lessons behind each rule.

## Four rules

1. **English first.** Ittro starts in English, and the demo is in English. Arabic and French are one spoken command away.
2. **Voice first, no screen.** Every action is a spoken command, changing the language too. Nothing needs the screen: there are no buttons to find. For noisy shops and private moments, the earbud button and a long press on volume-down back up the key commands (see "Buttons"). The only touch in the whole app is Android's microphone permission dialog on first launch, which TalkBack reads.
3. **Every word on screen is spoken.** The screen shows only the line Ittro is saying, set the moment that line starts playing. The command chips under it repeat words that are in that line. A line that was skipped never appears.
4. **Never silent, never chatty.** Words come only when something changes: a question, an answer, a new direction, a problem. Between them, sounds and vibration keep the shopper informed: never more than 2 s without a sound. Lines are short (12 words or fewer where possible), and the shopper can say "shorter" or "more detail".

## How Ittro talks

- **Short, then stop.** One fact and one action per line: "Masaad is to your right. Move your hand right."
- **Never speak as if the shopper can see.** No "look at", "see the sign", "the blue one". Colour may be added as an extra, never as the only cue.
- **Short cues, one axis at a time.** Three cues per direction, no numbered distances: "Move your hand right." for a new direction, "A little to your right." when the gap on that axis is under one hand width, and "Keep moving your hand right." when the same direction is still needed at the 6 s repeat. The proximity ticks carry the distance. Left or right first, then up or down. Name the hand or the phone whenever the one to move changes. A direction is spoken only after it has held for 0.4 s. The cues are recorded clips (`voice/`, "Voice").
- **Say what is uncertain.** "I can read Masaad, but not the size." Never a bare "I'm not sure".
- **A bad picture is not a doubt.** If the camera can't get a readable picture, Ittro says what to do with the phone (screen 10). If the picture is fine but the label doesn't settle it, Ittro says what it could read (screen 08).
- **Read text exactly.** Dates, sizes, prices and ingredients are read word for word from the label, never summarised or guessed. If part can't be read, Ittro says which part.
- **No medical advice.** Ittro does not identify medicines or judge whether a food is safe for someone. It reads the label text when asked.
- **Every "no" says the way.** "No. This is Guedila water. Masaad is to your right."
- **Acknowledge at once.** Within 0.3 s of the shopper finishing a sentence, a short "got it" sound plays. Then working ticks until the answer (Muse Spark takes 2–7 s to understand a sentence).

## Voice commands

The shopper can say these at any time, in the current language. Muse Spark understands them; there are no fixed word lists.

| Say | Ittro does |
|---|---|
| *what you want* ("I'm looking for Masaad water") | Repeats it back and asks "Is that right?" If the shelf shows several sizes and none was said, it asks which one. |
| yes / no | Answers the question just asked |
| where is it? | Says where the product is from the hand, or what it is doing to find it |
| is this the right one? / are you sure? | Reads the product in the hand again, from a new picture |
| read the date / size / price / ingredients | Reads it exactly, or says which part it can't read (screen 11) |
| got it / I'm touching it | After "Reach forward": the hand is on the product, so Ittro says "Pick it up." (screen 23) |
| guide me | Goes back to guiding the hand |
| read again | Reads the product in the hand again |
| keep looking | Continues searching after "I can't find it here" |
| find another | Starts a new search |
| start over | Drops the current search and asks what to find |
| done | Ends: "Okay. Say Ittro when you need me." |
| ask someone / ask Sara | Asks a helper about the product in the hand (screens 16–18) |
| add a helper | Pairs a helper's phone with a spoken code (screen 15) |
| cancel | Stops waiting for a helper |
| repeat | Says the last line again |
| shorter / more detail | Changes how much Ittro says; remembered |
| speak faster / speak slower | Changes Ittro's speaking speed; remembered |
| what do the sounds mean? | Plays the sound tour (screen 24) |
| next / skip | With a shopping list: moves to the next product (screen 30) |
| help | Says the commands for this moment (screen 12) |
| speak Arabic / speak French / English | Changes the language, confirmed in the new language (screen 13); remembered |
| stop | Stops speaking and guiding: "Stopped. Say Ittro when you need me." |
| Ittro | Wakes it after stop or done |

If a sentence isn't understood: "I didn't catch that. Say it again." The second time, it adds "or say help."

**Interrupting.** The goal is that the shopper can speak over Ittro and Ittro stops. That needs echo cancellation that works with the phone's own speaker, which the test project never proved: it muted the microphone while speaking and for 300 ms after. Test it on day 1. Until it works, keep lines short, play the listening sound when the microphone opens, and use earbuds for the demo.

## Choosing a language

The language is always chosen by voice. There are three ways in:

1. **On first launch (screen 20).** Ittro can't hear anyone until the microphone is allowed, so the order is:
   - the Microphone line (screen 02) in English, then in the phone's language if that is Arabic or French;
   - Android's permission dialog;
   - then, each line in its own voice: "I speak English." «للعربية، قل: عربي.» « Pour le français, dites : français. »
   - Ittro listens for 5 s. "عربي" or "français" switches at once. Silence or English keeps English.
   - Then the privacy line and the Welcome, in the chosen language.
2. **At any time, by command (screen 13).** "Speak Arabic", "speak French", "English", in any of the three languages («تكلم بالعربية», « parle français »).
3. **When the shopper speaks another language (screen 21).** If a sentence comes in Arabic or French while Ittro speaks English, Ittro answers that sentence in the shopper's language: «هل تريد أن أتكلم بالعربية؟ قل نعم أو لا.» Yes switches, then carries on with what the shopper asked. No: "Okay, I'll keep speaking English." Ittro asks only once per session, so code-switching (a French brand name in an Arabic sentence) never triggers it again.

Transcription is biased toward English, Arabic and French from the first second, not English alone, so the first Arabic or French sentence is heard correctly. The choice is remembered between launches. A switch changes the voice, the recorded direction words, the transcription order and the screen direction together.

## Buttons

Two physical controls back up the voice. Each press does exactly what the matching spoken word does, and Ittro says what happened, so rule 3 still holds.

**Earbud button** (wired or Bluetooth, through Android's media session; Ittro holds an active session while it runs):

| Press | Does |
|---|---|
| Once | "Yes" when a yes/no question is open; "got it" after "Reach forward"; otherwise "repeat" |
| Twice (or "next track") | "No" |
| Three times (or "previous track") | "Help" |
| Hold (0.8 s) | "Stop"; when stopped, wakes Ittro like saying "Ittro" |

- When earbuds connect, Ittro says once: "With your earbuds: press once for yes, twice for no, hold to stop." (screen 14). Help mentions the button only while earbuds are connected.
- Many earbuds turn a double press into "next track" and a long press into the phone's voice assistant before the app sees it. Ittro accepts "next track" as "no". If a hold never arrives, Ittro says once: "Your earbuds don't send a long press. Hold the volume-down key to stop me."

**Volume-down, held for 0.8 s:** "stop"; when stopped, wakes Ittro and repeats the last line. Short presses still change the volume. Ittro never uses both volume keys together, because that is TalkBack's on/off shortcut. On first launch, Ittro says: "You can also hold the volume-down key to stop me."

Naming a product, asking for a detail and changing the language still need speech; a whisper works, since the microphone is close.

## Asking a person

For the moments Ittro can't settle: an unreadable label, a product it can't find, or a shopper who wants a second opinion. A helper is a friend or relative with a smartphone. They answer from a web page; they install nothing.

**Adding a helper (screen 15).** The shopper says "add a helper". Ittro asks for a name ("Sara"), then says a six-digit code and the address: "Ask Sara to open ittro.djazair.dev/help and type 4 8 2 7 1 5. I'll wait." The shopper can pass this on by phone call. Sara types the code; her browser asks to allow notifications; Ittro says "Sara is now your helper." The shopper never touches the screen. (The address is a placeholder until the project's domain is set.)

**Asking (screen 16).** "Ask someone" (all helpers) or "ask Sara". Ittro always confirms before anything leaves the phone: "I'll send this picture and your question to Sara: is this Masaad water, 1.5 litres? Say yes to send." It sends the sharpest recent crop of the hand and product, the request and Ittro's own read. Ittro also offers it itself after two "can't read" results in a row: "Do you want to ask Sara? Say yes or no."

**Waiting (screen 17).** "Sent to Sara. I'll tell you when she answers. Say cancel to stop waiting." Ticks every 2 s for the first 10 s, then a soft pulse every 5 s and "Still waiting for Sara." every 30 s. With several helpers, the first answer wins. After 5 minutes: "Sara hasn't answered. Say ask again, or read again." The shopper can keep searching while waiting.

**The answer (screen 18).** A helper's answer is a verdict, said, shown and felt like Ittro's own, and always says who answered: "Sara says yes: this is Masaad water. Her note: it's the big one." A "no" is red, and a "can't tell" is amber.

**The helper's page (screen 19).** The question, the photo, Ittro's read, three large buttons (Yes, No, Can't tell) and an optional short note that is read aloud. The photo is deleted when Sara answers, or after 30 minutes.

## As fast as possible

What the test project and the research taught about speed:

1. **Two loops.** The phone tracks the hand and the target on every frame and does all the steering. Meta's models run on events: Voice Transcribe always listens, SAM 3.1 finds and re-finds, Muse Spark understands and reads. Guidance never waits for the cloud.
2. **Start looking while asking.** As soon as a request is understood, Ittro asks "Is that right?" and, at the same time, picks the package word from a photo, runs SAM and reads the shelf. Guidance waits for "yes", but the answer is often ready by then: "Masaad is to your right. Move your hand right."
3. **Read before being asked.** When a fingertip rests on a product for 0.5 s, Ittro reads it from the sharpest recent frame. The verdict comes by itself; "is this the right one?" is answered at once from the stored answer.
4. **Recorded direction cues.** The 30 fixed cues in `voice/SCRIPT.md` (directions, almost there, reach forward, pick it up, checking, yes, no, I can't confirm yet, hand and phone problems) are clips in each language, starting in under 50 ms. Text-to-speech only for sentences with names and label text. "Yes." and "No." clips start the verdict at once while the rest of the sentence is synthesised.
5. **One queue, in this order:** the product in the hand, the shopper's question, finding a lost target, the first shelf reads, the rest.
6. **Targets:** first outline under 3 s after "yes" (p50), the right product in the hand under 30 s, a verdict about 3 s after the hand stops, with the checking sound in between.
7. **Every answer is checked before it is spoken:** same step, same hand, not too old. An outdated answer is never spoken; Ittro reads again. If the shopper asked, it says "Your hand moved. Keep it on the product so I can read it."

## Silence budget

| Situation | What the shopper hears |
|---|---|
| A new screen | Its line, starting within 0.3 s. The screen never changes silently. |
| The shopper finished a sentence | A short "got it" sound within 0.3 s, then working ticks until the answer. |
| Ittro is working (reading labels, waiting for the network) | A soft tick every 2 s. A spoken update at 4 s ("Still reading. One label left."), then every 8 s. |
| Ittro asked a question and hears nothing | At 8 s: the question again, shorter ("I'm listening. Say yes or no."). At 20 s: "Say help to hear what you can say." Then a one-line reminder every 60 s. |
| Searching: the target isn't in view | "I don't see Masaad yet. Turn the phone slowly to your right." Ticks while the phone moves. After the whole shelf: "I checked six products. Masaad isn't here. Say keep looking, or find another." |
| Guiding, the hand is out of view | "I can't see your hand. Move it in front of the camera." Repeated every 6 s. |
| Guiding, hand tracking lost | The lost sound, then "I lost track of your hand. Keep it still." Directions stop until the hand is tracked again. |
| Guiding, the target left the picture | "Masaad is out of view. Turn the phone a little to your left." |
| Guiding, the hand is closing in | Proximity ticks (sound and vibration) speed up. "Almost there." is said once per approach, when the fingertip reaches the outline, and shown as it plays. Then only ticks. |
| Guiding, the fingertip covers the target | The camera can't see depth, so neither covering the outline nor stopping on it means touching. After 1 s over the target: "Your hand is lined up. Reach forward slowly to feel for it." (screen 23), then ticks while Ittro listens. |
| The shopper reaches the product | "Pick it up." plays only on real evidence of contact: the shopper says "got it" or "I'm touching it", presses the earbud button once, or the target's outline moves with the hand. Then "I'm checking." and a fresh read of the held product. |
| The camera points at the floor, the ceiling or nothing like a shelf | "Hold the phone at chest height, camera toward the shelf, about an arm away." (screen 22) |
| The phone sweeps too fast to read | "Move the phone more slowly." Once, then ticks. |
| Nothing of the kind asked for is in view | "I don't see any bottles here. Ask a staff member for the water aisle, or say ask someone." (screen 28) |
| The exact product isn't there, a close one is | "Masaad 1.5 litres isn't here. I see Masaad 0.5 litres. Do you want that one?" (screen 27) |
| Several identical targets | "I see three Masaad bottles. Guiding you to the nearest one, in the middle." (screen 29) |
| The network is down | "I've lost the internet. I'll keep trying." Then the working ticks, and an update every 8 s. |
| Waiting for a helper | Ticks every 2 s for 10 s, then a soft pulse every 5 s and an update every 30 s. Gives up after 5 minutes. |
| After stop or done | Silence is allowed for 2 minutes while Ittro listens for its name. Then a closing sound and "I'm pausing. Press your earbud button or open Ittro to wake me." (screen 26); the microphone and camera turn off. |
| A phone call, the screen locking, another app taking the sound | Ittro pauses at once. On return: "Welcome back. Still looking for Masaad water." (screen 25) |
| Battery at 15%, or the phone too hot | Said once: "Battery at 15%." / "The phone is getting hot. I'll slow down a little." |

## Sounds

The voice indicator (top-left, 60 round) has no words, so each state has a sound:

| State | Indicator | Sound |
|---|---|---|
| Speaking | Brand-blue circle, speaker icon | Ittro's voice |
| Listening | Dark circle with a pale ring, microphone | Two rising notes when the microphone opens |
| Heard | (no change) | One short soft note, within 0.3 s of the shopper finishing |
| Working | Dark circle, three dots | A soft tick every 2 s |
| Tracking lost | (no change) | A low falling note, so lag is never mistaken for a wrong direction |

Verdicts also have a chime, played with their vibration and their first word.

The files are in `sounds/`, as 16-bit mono WAV at 44.1 kHz. Each one's loudness is already set, so play them all at the same volume. The quiet state sounds sit well under speech; the verdict chimes are the loudest. `sounds/make_sounds.py` remakes them all with Python alone (`python3 sounds/make_sounds.py sounds`).

| File | Plays when | Length |
|---|---|---|
| `heard.wav` | Within 0.3 s of the shopper finishing a sentence | 0.09 s |
| `listening.wav` | The microphone opens for an answer | 0.23 s |
| `working-tick.wav` | Every 2 s while Ittro works | 0.03 s |
| `lost.wav` | Hand tracking is lost; directions stop | 0.38 s |
| `proximity-tick.wav` | With each 30 ms proximity vibration | 0.03 s |
| `helper-pulse.wav` | Every 5 s while waiting for a helper, after the first 10 s | 0.16 s |
| `pausing.wav` | Before "I'm pausing" (screen 26) | 0.46 s |
| `waking.wav` | When Ittro wakes from a pause | 0.36 s |
| `yes.wav` | Yes verdict: chime up | 0.81 s |
| `no.wav` | No verdict: chime down | 0.98 s |
| `not-sure.wav` | Not sure verdict: a single low, wavering note | 0.45 s |

## Voice

| Language | Voice | Fixed cues (`voice/SCRIPT.md`) | Sentences with names and label text |
|---|---|---|---|
| English | Meta MMS-TTS, `facebook/mms-tts-eng` | `voice/<id>.en.wav`, shipped with the app | MMS on the phone |
| French | Meta MMS-TTS, `facebook/mms-tts-fra` | `voice/<id>.fr.wav`, shipped with the app | MMS on the phone |
| Arabic | The phone's own text-to-speech | Made on first launch with `synthesizeToFile` from `voice/clips.json`, kept until the Arabic voice or speed changes | The phone's voice |

- MMS ignores punctuation. Split each sentence at `. , : ? !`, speak the parts one by one, and add 0.3 s after a full stop and 0.12 s after a comma. Fix the random seed so a sentence sounds the same every time.
- "Speak faster" and "speak slower" change MMS's speaking rate for sentences and the playback speed of clips, with pitch kept.
- MMS runs on the phone through ONNX Runtime (ONNX copies: `Xenova/mms-tts-eng`, `Xenova/mms-tts-fra`). Day-1 test on the phone: if a 12-word sentence takes more than about 1 s to synthesise, keep the MMS clips but speak English and French sentences with the phone's voice.
- MMS is licensed CC BY-NC 4.0: free and open-source use only, with credit to Meta in the README and the app's licence notes.
- Arabic MMS was tested and rejected on 27 Oct: the model drops the vowel marks and mispronounces. Teaching it the harakat (fine-tuning on diacritized speech) is left for after the hackathon.

## Haptics

| Event | Pattern (ms, Android `vibrate`) |
|---|---|
| Yes | `[0, 60, 80, 60]`: two short buzzes |
| No | `[0, 120, 90, 120, 90, 120]`: three buzzes |
| Not sure | `[0, 400]`: one long buzz |
| Proximity tick | A 30 ms pulse; the gap shrinks from 600 to 120 ms as the fingertip nears the target |

Vibration runs in parallel with sound, so the shopper can turn the volume down in public and still be guided.

## Holding the phone

One hand holds the phone at chest height, camera toward the shelf, about an arm's length away; the other hand reaches. Ittro teaches this out loud: after the first "yes" of every session, and whenever the camera sees no shelf (screen 22). A lanyard or chest mount works the same way. Ittro never asks for both hands on the phone. Audio works from the phone speaker, one earbud or bone-conduction headphones; it never needs both ears covered.

## First launch, in order

1. Permissions (screen 02): "I need the microphone to hear you and the camera to see the shelf. Android will ask twice. Double-tap Allow each time." In the phone's language too, if that is Arabic or French. If either is refused, Ittro says which one and how to allow it in settings.
2. Choose a language (screen 20).
3. Privacy: "I find products and guide your hand to them. I send camera pictures to Meta to find and read products. I don't keep them."
4. Buttons: "You can also hold the volume-down key to stop me."
5. Sound tour offer: "Do you want to hear what my sounds mean? It takes 30 seconds. Say yes or no." (screen 24)
6. Welcome (screen 01).

## Real phone conditions

- **Volume.** At every start, if the media volume is under 30%, Ittro raises it to 50% and vibrates once, so it is never talking into silence.
- **Screen and pocket.** The screen stays on while Ittro is looking or guiding. If the screen locks or the phone goes into a pocket, Ittro pauses.
- **Interruptions.** A call, an alarm or another app taking the sound pauses Ittro and the camera. On return it says where it was (screen 25).
- **Battery and heat.** At 15% battery, and when the phone gets hot, Ittro says so once. When hot, it slows camera reads before anything else.
- **Speaking speed.** "Speak faster" and "speak slower" change Ittro's own voice; remembered. TalkBack users often listen at high speed.
- **Idle.** After done or stop, Ittro listens for its name for 2 minutes, then pauses fully (screen 26).

## Real shop conditions

- **Wrong shelf (screen 28).** If SAM finds nothing of the kind asked for, Ittro says so and points to a person instead of sweeping forever.
- **Sold out, close match (screen 27).** If the brand is there but another size or variant, Ittro offers it. It never guides to it without a yes.
- **Several matches (screen 29).** Ittro picks the nearest (the largest and most central outline) and says how many it sees.
- **Putting back a wrong product (screen 07).** "Put it back" comes before the way to the right one.
- **Shopping list (screen 30).** "I need water and Elio oil" is confirmed as a list. After each Found: "Next: Elio oil." "Skip" moves on; "done" ends the list.

## Privacy and memory

- On first launch, after the language choice: "I send camera pictures to Meta to find and read products. I don't keep them."
- No picture is stored on the phone or the relay after its answer arrives. A picture sent to a helper is kept only until they answer, or 30 minutes at most, and is sent only after the shopper says yes.
- The camera runs only while Ittro is looking or guiding.
- Language, "shorter / more detail" and speaking speed are remembered between launches and never reset by updates.

## TalkBack

When TalkBack is on, Ittro speaks through TalkBack announcements instead of its own text-to-speech, so two voices never overlap. The screen is one live region holding the spoken line. Camera outlines, icons, the meter and the voice indicator are hidden from TalkBack (`importantForAccessibility="no"`); the spoken line carries their meaning.

TalkBack announcements can't be cut off or ranked the way Ittro's own voice can. On day 1, test both paths with TalkBack on (a direction superseding an older one, a "no" interrupting guidance) and keep the one that handles interruptions; if Ittro's own voice wins, pause TalkBack's speech for the app's live region instead.

## Logo

A fingertip touching a product outline, with two rings of a voice answering. The finger comes in from the bottom-left corner, which is the way a hand reaches into the camera's view.

- Grid: 108 × 108, the Android adaptive-icon grid.
- Ittro blue `#2A62F0` behind, white glyph.
- A blue stroke 24 wide under the finger cuts the outline, so the finger reads as being in front of the product.
- On one colour (themed icons, notifications), that gap is cut with a mask instead. See `logo/ittro-adaptive-monochrome.svg`.
- Never put the logo on green, red or amber. Those colours are kept for verdicts.

The name is **Ittro**, set in Readex Pro. Ittro says its name on the Welcome screen, so the wordmark there is spoken too.

## Colours

| Token | Hex | Use |
|---|---|---|
| ink | `#0B0E13` | Ground of Welcome; text on green and amber |
| panel | `#161B23` | The text panel at the bottom of the camera screens |
| line | `#2A313C` | Chip borders, empty meter segments |
| paper | `#F5F3EE` | Text on dark |
| muted | `#A9B1BD` | Rarely used: nothing unspoken goes on screen |
| brand | `#2A62F0` | Logo, the speaking indicator, direction arrows |
| brandLight | `#7EA6FF` | Reading outlines, meter, the working dots, the search arrow |
| brandPale | `#B8CCFF` | The listening ring, chip microphones |
| yes | `#2BD98A` | Found screen; the target's outline on the camera |
| no | `#B3261E` | Wrong-product screen |
| notSure | `#FFB224` | Not-sure screen |

Green, red and amber mean only yes, no and not sure. They also differ in lightness, so they can be told apart without colour vision. The brand is blue so it never reads as a verdict.

All values are in `tokens/tokens.json`.

## Type

- **Readex Pro** for Latin and Arabic. Use the `@expo-google-fonts/readex-pro` package (weights 400, 500, 600 and 700). Ask before installing it.
- **Spoken line:** 32, SemiBold (600), line height 1.3, left-aligned. It is the only sentence on screen. Respect the system font scale and let it wrap.
- **In Arabic:** 34, SemiBold, line height 1.4, right-aligned, `writingDirection: 'rtl'`.
- **Command chips:** 20, Medium, 44 tall, with a small microphone icon. They are hints you say, not buttons, so they have no touch action.
- **Verdict word** (Yes, No, Maybe): 48, Bold.

## Screens

PNG renders are in `screens/` at 2×, each next to an HTML file with the exact layout. The camera image is a drawing; in the app it is the live camera. Every line below is spoken, in full, when the screen appears.

### 01 Welcome

- Ink background. Logo 112 and "Ittro". Speaking indicator.
- Says: "Hi, I'm Ittro. Tell me what you're looking for, or say help."
- First launch only, before it, in the chosen language: "I find products and guide your hand to them. I send camera pictures to Meta to find and read products. I don't keep them." (The first-launch order is in "Choosing a language".)
- Chip: help. The microphone opens when the line ends (two rising notes).

### 02 Permissions (first launch only)

- Says: "I need the microphone to hear you and the camera to see the shelf. Android will ask twice. Double-tap Allow each time." If the phone's own language is Arabic or French, the same line follows in that language, so the shopper understands before the dialogs appear.
- If one is refused: "I can't hear you without the microphone." / "I can't see the shelf without the camera." then how to allow it in settings.
- Then Android's permission dialog appears; TalkBack reads it. Ittro waits.
- If the permission is refused: "I can't hear you without the microphone. Open Ittro's settings and allow it, then come back."

### 03 Confirm the request

- The camera, dimmed with ink at 55%. Listening indicator.
- Says: "You asked for Masaad water. Is that right? Say yes or no."
- Chips: yes, no. A new product name instead of yes or no corrects the request.
- Ittro is already looking at the shelf while it asks.

### 04 Searching (the target isn't in view)

- The camera, not dimmed. A brand-light arrow at the screen edge shows the way to move the phone.
- Says: "I don't see Masaad yet. Turn the phone slowly to your right."
- Ticks while the phone moves. SAM runs again when the picture has changed enough.
- After the whole shelf: "I checked six products. Masaad isn't here. Say keep looking, or find another."

### 05 Reading the shelf

- Working indicator. Each product SAM 3.1 outlined gets a dashed brand-light outline (4 wide, dashes 10/8). The outlines carry no words.
- Says: "I see two bottles. Reading their labels. Hold the phone steady."
- Ticks every 2 s; at 4 s: "Still reading. One label left."

### 06 Guiding the hand

- The target gets a solid yes-green outline (5 wide) over an ink halo (11 wide, 70%), a 12% green fill and a green name pill. The name is in the spoken line.
- A dashed brand-light arrow runs from the fingertip toward the target, only while a hand is tracked.
- Panel: a brand-blue circle (64) with the direction arrow, then the line. Says: "Masaad is to your right. Move your hand right." The first sentence, with the name, is synthesised; every cue after it is a clip.
- Proximity meter: 5 segments, filled as the fingertip gets closer. It mirrors the ticks you hear and feel. Close in, "Almost there." once, then only the ticks speak. When the fingertip covers the target, screen 23. "Pick it up." needs evidence of contact, never just a stop or an overlap.

### 07 Wrong product

- The whole screen turns red the moment an in-hand read says no. Three buzzes and the "no" chime.
- A white circle with ✕ and "No"; a card with the crop that was read and its name.
- Says: "No. This is Guedila water. Put it back. Masaad is to your right. Say guide me, or read again."
- If the hand stays on it, the "no" and the way are said again, never only buzzed.

### 08 Not sure

- Amber, with ink text. One long buzz.
- A dark circle with a turning arrow and "Maybe"; the crop and "Masaad?".
- Says what it could and couldn't read: "I can't confirm yet. I can read Masaad, but not the size. Turn it slowly." The first sentence is the cannot_confirm clip.
- Ittro reads again every 1.2 s while it turns, at most 5 times, then "I can't read the size. Try holding it closer."

### 09 Found

- Green, with ink text. Two short buzzes and the "yes" chime.
- A dark circle with ✓ and "Yes"; the crop and "Masaad water, 1.5 L".
- Says every attribute that was asked for and checked: "Yes. This is Masaad water, 1.5 litres. Say find another, or done."
- "Yes" needs a fresh read of the held product with every asked attribute matched. An attribute that can't be read gives screen 08, never a "yes".

### 10 Picture problem

- The camera can't get a readable picture: blurred, too dark, glare, too far, or the label is turned away.
- Says one action: "The label is blurry. Hold the phone still for a second." Others: "It's too dark here. Move closer to the light." "There's a reflection. Tilt the product a little." "Bring it closer to the phone." "Turn it so the label faces the phone."
- It is never presented as a doubt about the product.

### 11 Details (say "read the date")

- The crop of the part that was read, then the exact text: "The date says: best before 12 March 2027."
- If it can't: "I can't read the date. The print is too small. Bring it closer."
- Same for size, price and ingredients. Ingredients are read in full, never summarised.

### 12 Help (say "help")

- The camera, dimmed 70%. Speaking indicator.
- Says the commands that fit this moment, then the step's question: "You can say: find a product, where is it, is this the right one, read the date, ask someone, repeat, speak Arabic, or stop. What are you looking for?" With earbuds connected, it adds: "Or press once for yes, twice for no, hold to stop."
- Each command is a chip, shown in the order spoken.

### 13 Language (say "speak Arabic")

- Ittro switches its voice, the transcription bias, the recorded clips and the screen together, then confirms in the new language.
- Says: «حسناً، سأتكلم بالعربية الآن. قل English للعودة إلى الإنجليزية.»
- Chip: English. The layout mirrors to right-to-left; the voice indicator moves to the top-right.

### 14 Earbud button

- Said once when earbuds connect: "With your earbuds: press once for yes, twice for no, hold to stop."
- Three rows show the presses; their words are in the line.

### 15 Add a helper (say "add a helper")

- The code in large digits and the address, both spoken: "Ask Sara to open ittro.djazair.dev/help and type 4 8 2 7 1 5. I'll wait."
- "Repeat" says the code again, digit by digit. The code expires after 10 minutes.

### 16 Ask a person (say "ask someone")

- The camera dimmed 45%, the hand on the product. Listening indicator.
- Says: "I'll send this picture and your question to Sara: is this Masaad water, 1.5 litres? Say yes to send." Chips: yes, no.

### 17 Waiting for the person

- A large circle with the helper's initial, pulsing. Working indicator.
- Says: "Sent to Sara. I'll tell you when she answers. Say cancel to stop waiting." Chip: cancel.

### 18 The person answered

- The verdict colour of the answer (green here), "Yes", the crop and "Sara: Masaad water".
- Says: "Sara says yes: this is Masaad water. Her note: it's the big one. Say find another, or done."

### 19 The helper's page

- Not part of the app: a web page served by the relay, for a sighted helper. Light theme, three answer buttons at least 60 tall, a note field.

### 20 Choose a language (first launch)

- Ink background, logo. Speaking indicator.
- Three lines, each shown as it is spoken, each in its own voice: "I speak English." «للعربية، قل: عربي.» « Pour le français, dites : français. »
- Chips: عربي, français.

### 21 Language offer

- The shopper spoke Arabic while Ittro speaks English. Listening indicator at the top-right; the panel is right-to-left.
- Says, in Arabic: «هل تريد أن أتكلم بالعربية؟ قل نعم أو لا.» Chips: نعم, لا.
- The earbud button works here too: once is yes, twice is no.

### 22 How to hold the phone

- The camera shows the floor. Speaking indicator, an up arrow.
- Says: "The camera points at the floor. Hold the phone at chest height, camera toward the shelf, about an arm away." Also said once after the first "yes" of a session, without the first sentence.

### 23 Reach forward

- The fingertip covers the green outline for 1 s. That is alignment in the picture, not contact.
- Panel: a brand circle with a target icon. Says: "Your hand is lined up. Reach forward slowly to feel for it."
- Then ticks while Ittro listens for "got it", the earbud press or the outline moving with the hand; only then "Pick it up."

### 24 Sound tour (say "what do the sounds mean?")

- Each sound plays, then its meaning is said; its row appears as it is said. Six rows: heard, working, listening, lost, yes, no.
- Says, for the lost sound: "This falling note means I lost track of your hand. Keep it still."

### 25 Welcome back

- After a call, a lock or another app's sound. Says: "Welcome back. Still looking for Masaad water."

### 26 Paused

- 2 minutes after done or stop. Logo dimmed, no voice indicator. Says: "I'm pausing. Press your earbud button or open Ittro to wake me."

### 27 Close alternative

- The asked-for size isn't on the shelf; the brand is. The alternative gets a dashed brand-light outline, not green, until the shopper says yes.
- Says: "Masaad 1.5 litres isn't here. I see Masaad 0.5 litres. Do you want that one?" Chips: yes, no.

### 28 Wrong shelf

- Says: "I don't see any bottles here. Ask a staff member for the water aisle, or say ask someone." Chip: ask someone.

### 29 Several matches

- The nearest gets the full green outline; the others a thin green line.
- Says: "I see three Masaad bottles. Guiding you to the nearest one, in the middle."

### 30 Shopping list

- Says: "You asked for two things: Masaad water, then Elio oil. Is that right? Say yes or no." Chips: yes, no.
- After each Found: "Next: Elio oil." "Skip" moves on.

## Not in this version

- **Hands-free glasses.** The research points to glasses for both hands free. The phone works one-handed and on a lanyard; glasses are out of scope.
- **Offline finding and reading.** Hand tracking, the recorded clips and the MMS voice work offline; finding and reading need Meta's cloud.

## Accessibility checks

- Contrast: paper on panel 15.6:1, ink on green 10.5:1, white on red 6.5:1, ink on amber 10.7:1.
- Nothing depends on colour alone: each verdict has its word, its icon, its chime and its vibration.
- Nothing depends on sight at all: each state is spoken, and each wait has a sound.
