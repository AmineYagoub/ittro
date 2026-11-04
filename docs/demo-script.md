# Ittro demo video script (3 minutes)

One real search in English on the rice shelf, filmed in one take of
1:23 on 3 November 2026: the shopper asks what is on the shelf, picks
the basmati rice, is guided to it, and Ittro reads the bag in the hand
before it says yes. The narration before and after the take states
what was built during the hackathon and backs it with the diagram, the
dated build log and the code. Under 180 s in all.

The rules ask that the video shows only what was built during the
hackathon (27 October to 4 November 2026), so that judges can tell
it apart. Shot 2 states what was built before the take is shown;
shot 4 backs it with the diagram, the dated build log and the code.

The opening (shots 1 and 2) states the gaps found by the two research reports run on 22 October, before the build ("What Blind and Low-Vision People Still Struggle With in Shopping and Daily Life" and "Blind shoppers still cannot find and confirm items"; how the design answers each finding is in [design/AUDIT.md](design/AUDIT.md)): apps describe the shelf but none checks the item against the request, models confuse look-alike products, visual assistants give incorrect information, and the research prototypes we reviewed guide people with depth-sensing iPhones or smart glasses. Each figure is quoted as research, with its source on the card:

- Look-alikes: "What Matters for Grocery Product Retrieval", ICPR 2026: 190 open-source models; state-of-the-art models reach 94.5% Recall@5 and drop 17.5% at Recall@1, so about 77% right first (our subtraction), and fail to rank visually similar products.
- Incorrect answers: diary study with 20 blind and low-vision people, CHI 2026: on VisionPal, a study app built on GPT-4o, 122 of 549 answerable follow-ups (22.2%) were fully or partly incorrect.
- Special hardware: NaviSense (ASSETS 2025) and Touvigation (2026) use a depth-sensing iPhone, the latter chest-mounted; ObjectFinder (2026) uses smart glasses.
- No check: Be My AI and Google's Guided Vision (1 October 2026) describe the scene or help aim the camera; neither checks the item against the request.

The name comes from the question: **I**s **T**his **T**he **R**ight **O**ne?

Two voices are heard, and they must never be confused:

- **The narrator:** the founder, recorded afterwards in the founder's
  own voice. Plain sentences, no music under the speech.
- **Ittro:** the phone's own voice, from the take as recorded. A
  caption shows each Ittro line as it is spoken.

The take is kept as it was filmed: never re-voice Ittro, never cut a
wait out of it. Every Ittro line below is a sample of what the app
says; caption what the take actually says. The narrator speaks over
the take only in its two waits, never over Ittro.

## The take

Filmed on 3 November on a local release build of `main` at 96a0339
plus the uncommitted fixes on `fix/start-voice-hearing`: the shorter
first launch, a fresh start on every open, the mic that opens right
after each line, the camera's focus wait, guidance cues that neither
the ticks nor the six-second repeat cut, and plurals said once. Its
build settings are the release workflow's: the relay's access code
only, so the default relay (`ittro.djazair.dev`), the grounding find
on, and engine cues off (`EXPO_PUBLIC_ENGINE_CUES` unset).

Two voices are heard from Ittro in the take, as in the release:

- **Meta MMS-TTS**, recorded: the fixed cues ("I'm checking", "Yes",
  "A little to your right", "Your hand is lined up…").
- **The phone's voice** (`en-us-x-tpd-network` on this phone), live:
  every sentence with a name or an answer in it.

The release page in shot 4 must be the release built from those fixes
with the same settings, not v0.1.0 or v0.1.1, which lack them.

Nothing on screen may show a secret: no terminal, no `deployed.env`,
no `.dev.vars`, no access code.

## Shot list

| # | Time | Camera shows | Spoken |
|---|---|---|---|
| 1 | 0:00–0:30 | Close on the El Taounia bags: the white rice and the basmati side by side, same brand, same pattern. Then the shopper with the phone. Card 01 (the problem, with its sources), then card 01b: "Is This The Right One?" with I, T, T, R, O lit. | **Narrator:** "Blind shoppers can ask an app what's on the shelf. With the apps we reviewed, checking the package in their hand is still left to them. And AI alone isn't enough. In one grocery benchmark, top models ranked the right product first only about 77% of the time. In another study, a visual assistant gave incorrect information in over one in five follow-ups. So shoppers still ask someone: is this the right one? That question gave Ittro its name." |
| 2 | 0:30–0:48 | The phone's screen on the shelf, the outline drawn. Caption: "Built during the hackathon". | **Narrator:** "The research prototypes we reviewed used depth-sensing iPhones or smart glasses to guide people to objects. During this hackathon, I built Ittro for a standard Android phone: the voice conversation, hand guidance, the label check once the product is in hand, and the relay to Meta's models." |
| 3 | 0:48–2:11 | The take, 1:23, uncut: over the shoulder, phone screen visible. On-screen timer labelled "elapsed since shelf question", from the end of "What's on the shelf?". | See "Inside the take" below. |
| 4 | 2:11–2:55 | The README's diagram for 8–10 s, then `docs/BUILD_LOG.md` scrolled through its dated days, then `relay/src/find.ts`, `relay/src/masks.ts` and `Gyro.kt`, then the release page. | **Narrator:** "This diagram shows what I built and what each Meta model does. The build log dates every piece. The relay asks Muse Spark to box each matching package in the shelf photo, and SAM 3.1 cuts each box into a mask, which the relay traces into an outline. On the phone, the outline is kept on the product with the gyroscope and the camera's own motion. Meta's models, MediaPipe's hand model, Expo and the MMS voices are existing tools. The dated entries identify our original Ittro work; existing tools and prior materials are listed separately." |
| 5 | 2:55–3:00 | Card: Ittro, the repo link, the release link. | **Narrator:** "Ittro is open source. The app is on the release page." |

## Inside the take (shot 3)

Times are from the start of the take; fill in the real ones from the
footage.

| Take | Shopper | Ittro (sample) | Narrator |
|---|---|---|---|
| 0:00 | | "Hi, I'm Ittro. Tell me what you're looking for, or say help." | |
| ~0:10 | "What's on the shelf?" | | |
| ~0:20 | | "On this shelf on top left and middle are Riz blanc and Riz Basmati, and on top right is Haricot Blanc, and on the bottom are Medina honey cups." | |
| ~0:33 | "I want basmati rice." | "Looking for basmati rice." | While Ittro looks: "Muse Spark boxes each bag that matches; SAM 3.1 outlines them." |
| ~0:43 | | "I found basmati rice in the middle." Then the hand cues: "A little to your right." "Keep moving your hand right." "Your hand is lined up. Reach forward slowly to feel for it." | |
| ~1:00 | Touches the bag. | "I'm checking." | While Ittro checks: "Now it reads the bag in the hand." |
| ~1:08 | Picks it up. Green screen. Timer stops. | "Yes. This is basmati rice. Say find another, or done." | |
| ~1:18 | "Done." | "Okay. Say Ittro when you need me." | |

The fixed cues are Meta's MMS voice and the sentences are the phone's
voice (see "The take"). Both are Ittro and both are captioned.

## Captions

- Ittro's lines: white on dark, bottom of the frame, word for word.
- Shot 4 names each Meta model on screen as the narrator says it:
  Muse Voice Transcribe, Muse Spark, SAM 3.1, MMS-TTS.
- Shots 2 and 4 keep the caption "Built during the hackathon" on
  screen while the narrator says what was built.

## Phone numbers (fill after the take, never invent)

Measured from the footage, never from the storyboard times above.
Two origins, each named where it is shown:

- **Elapsed since shelf question** (the on-screen timer): from the end
  of "What's on the shelf?" to the shelf answer, Xs; to the final
  "Yes", Ts.
- **Request to verdict:** from the end of "I want basmati rice" to the
  outline, Ys; to the final "Yes", Zs.
- 10-product set: found N/10, wrong yes M (must be 0), verdicts
  under 30 s.
- 20-minute session: battery drain N%, memory growth N MB, heat
  alerts N.

See [measure.md](measure.md) for how each number is collected and
[BUILD_LOG.md](BUILD_LOG.md) for the dated log.
