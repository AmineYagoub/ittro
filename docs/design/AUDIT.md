# Design audit, 27 October 2026

This audit checks the voice-only Ittro design (DESIGN.md, screens 01–13) against three sources:

- **R1**: the first deep-research result (22 Oct), "What Blind and Low-Vision People Still Struggle With in Shopping and Daily Life".
- **R2**: the second deep-research result (22 Oct), "Blind shoppers still cannot find and confirm items".
- **T**: the Ittro test project (22–26 Oct): the Meta API lessons note, the real-time guidance report, the optimization report and the phone test logs.

Status: **Covered** (the design already did this), **Added** (fixed by this audit), **Open** (not covered, with the reason).

## Summary

- 41 findings checked. 11 were already covered, 29 are now added and 1 stays open (offline finding and reading). The human handoff (#38) and the non-speech controls (#41) were added in a second pass, at the founder's request. One added item, hands-free use (#39), is only half done: the phone works one-handed, but glasses are out of scope.
- The audit added three screens: **04 Searching** (the product isn't in view), **10 Picture problem** (bad picture, not doubt) and **11 Details** (exact label text).
- Two screens changed. Guiding now names the product, then short recorded cues, and Not sure says what was and wasn't read.
- Each Added row's "Where" column points at the screen, rule, or phase that carries it.
- **Voice is no longer the only control.** Both research results say voice should not be the only control. The founder added the earbud button and the volume-down hold; the screen is still never needed.

## What the shopper must be able to do

| # | Finding | Source | Status | Where |
|---|---|---|---|---|
| 1 | Name it → find candidates → tell the exact variant → guide → verify what was touched → read what matters → admit uncertainty → offer a human | R1 summary | Covered except the human | Screens 03–11; human: Open (#38) |
| 2 | Confirm the exact item after the hand reaches it | R1 must; R2 #14 | Covered | Screen 09: "yes" needs a fresh read of the held product |
| 3 | Read back the attributes that tell variants apart: brand, variant, size | R1 must | Added | Each asked attribute is matched, contradicted or unreadable; the yes line names each one |
| 4 | Say "I'm not sure" and explain what is uncertain | R1 must; R2 #5 | Added | Screen 08: "I can read Masaad, but not the size." |
| 5 | Rapid re-checks: "read that again", "check size", "are you sure?" | R1 must | Covered | Commands: read again, is this the right one, read the size |
| 6 | Continuous, actionable spatial guidance, not a scene description | R1 must; R2 #3 | Covered | Screen 06 |
| 7 | Never invent; say exactly what can't be read | R2 #5; R2 must avoid | Added | "Read text exactly" rule; screen 11 says which part is unreadable |
| 8 | Separate "your picture is bad" from "I'm unsure" (most-requested improvement, AFB n=290) | R2 #4 | Added | Screen 10 Picture problem vs screen 08 Not sure |
| 9 | Camera-aiming guidance when the target isn't in view | R2 #4, #7 | Added | Screen 04 Searching: which way to move the phone; "isn't here" after the whole shelf |
| 10 | Read dates, prices, allergens exactly; these are high-stakes | R1 high-stakes; R2 #3 | Added | Screen 11 Details: word for word, ingredients in full |
| 11 | No medical advice; don't market AI as a safety substitute | R1 must avoid; hackathon rules | Added | "No medical advice" rule |
| 12 | Explicit confirmation before acting; a way to start over | R2 #16 | Covered + Added | Confirm screen 03; "start over" command |
| 13 | Ask for the missing attribute when variants exist | R1 "which of these is 500 g?"; R2 variants | Added | Confirm asks which size if several are on the shelf and none was said |

## How Ittro talks

| # | Finding | Source | Status | Where |
|---|---|---|---|---|
| 14 | Voice input for targets and follow-ups (23 of 24 preferred voice) | R2 #8 | Covered | Voice only |
| 15 | No long scene descriptions; concise, task-relevant | R1 must avoid; R2 #7 | Added | Rule 4 "never chatty", 12-word lines |
| 16 | Verbosity control, remembered | R2 #7 | Added | "shorter" / "more detail", remembered |
| 17 | No constant chatter; constant guidance is "cognitively demanding" | R2 #6; R2 must avoid | Added | Words only on change; close in, only ticks |
| 18 | Never speak as if the user can see | R2 must avoid | Added | "How Ittro talks" rule |
| 19 | Body-relative units ("two palms left") beat centimetres | R2 #6 (Touvigation, Monash) | Changed (27 Oct) | No distances are spoken: three short cues per direction ("Move your hand right.", "A little to your right.", "Keep moving your hand right."), and the proximity ticks carry the distance (voice/SCRIPT.md) |
| 20 | One axis at a time, with hysteresis so cues don't flip | T guidance report (Touvigation, Zenodo) | Added | Left/right then up/down; 0.4 s hold |
| 21 | Proximity-coded sound plus vibration in parallel; not pitch alone | R2 #6; R2 must avoid | Covered | Ticks + vibration + words |
| 22 | "I may not want my volume up in public" | R2 #6 | Added | Vibration carries every verdict and the proximity |
| 23 | Users can't tell lag from a wrong direction: "tracking" and "lost" sounds | T (Touvigation) | Added | "Tracking lost" sound; directions stop while lost |
| 24 | A "no" must say the way, and repeat while the hand stays | T phone tests | Covered | Screen 07 |
| 25 | Tone that isn't patronising; no needless safety warnings | R2 must avoid | Covered | Short, factual lines; no warnings |

## Speed

| # | Finding | Source | Status | Where |
|---|---|---|---|---|
| 26 | Answers in about 2 s; total find under about 30 s; 30–50 s is unacceptable | R2 #2; R1 latency | Added | Targets in "As fast as possible" and tokens |
| 27 | Keep steering on the phone; cloud on events (two loops) | T guidance report; T optimization report | Added | "As fast as possible" item 1 |
| 28 | Start the search while confirming | T (request → confirm → SAM was serial, ~22 s to first read) | Added | Item 2; prompt phase 4 |
| 29 | Speculative read when the fingertip rests (0.5 s) | T guidance report; ASSETS'25 "action-triggered help" | Added | Item 3; prompt phase 6 |
| 30 | Recorded clips for direction words (TTS start is slow and unreliable) | T guidance report | Added | Item 4; prompt phase 5 |
| 31 | One priority queue: held product first | T optimization report | Added | Item 5; prompt phase 4 |
| 32 | Every answer checked for freshness before it is spoken | T Meta API lessons | Covered | Item 7; prompt phase 6 |
| 33 | Acknowledge the shopper at once; Muse Spark needs 2–7 s per sentence | T (understand route timings) | Added | "Heard" sound within 0.3 s |
| 34 | Mic muted during speech loses quick answers; barge-in needs proven echo cancellation | T optimization report | Added | "Interrupting" note: day-1 test, fallback |

## Trust, privacy, setup

| # | Finding | Source | Status | Where |
|---|---|---|---|---|
| 35 | Work with TalkBack, not a separate universe; no visual-only setup step | R1 must; R2 #10 | Covered | TalkBack section; screen 02 |
| 36 | Credible privacy model: no image retention, capture only when needed | R1 must; R2 #12 | Added | "Privacy and memory"; first-launch line |
| 37 | Settings that reset drive users away | R2 must avoid | Added | Language and verbosity remembered |
| 38 | One-phrase human handoff with the last picture and question | R1 must; R2 #11 | Added (27 Oct, second pass) | "Ask someone": helpers paired by a spoken code, web-push answers, screens 15–19; no touch needed |
| 39 | One hand, ideally hands-free; open-ear audio | R1 must; R2 #1 | Added (phone) / Open (hands-free) | "Holding the phone": one hand, lanyard works, one earbud or bone conduction. Glasses are out of scope. |
| 40 | Degraded or offline operation | R1 must | **Open** | Hand tracking and clips run offline; finding and reading need Meta's cloud. "I've lost the internet" is spoken. |
| 41 | A non-speech control channel for noise and privacy | R1 must and must avoid | Added (27 Oct, second pass) | Earbud button and volume-down hold back up yes, no, help and stop ("Buttons", screen 14) |

## Blind-shopper walkthrough (27 Oct, third pass)

A step-by-step walkthrough as a blind TalkBack user with a cane, then a design review, found 16 more gaps. All were added at the founder's request.

| # | Gap | Severity | Fix | Where |
|---|---|---|---|---|
| W1 | Camera permission never explained | Critical | Permissions screen covers microphone and camera | Screen 02; "First launch, in order" |
| W2 | How to hold and aim the phone never taught | Critical | Spoken after the first "yes" and whenever no shelf is in view | Screen 22; "Holding the phone" |
| W3 | No depth cue: the hand can cover the product in the picture without touching it | Critical | "Your hand is lined up. Reach forward slowly to feel for it."; "Pick it up." only on evidence of contact (says "got it", earbud press, or the outline moves with the hand) | Screen 23; silence budget |
| W4 | Sounds never explained | Critical | 30-second sound tour, offered on first launch and on demand | Screen 24 |
| W5 | Calls, screen lock, pocket, other apps' audio | Critical | Screen kept on while active; pause and "Welcome back" on return | Screen 25; "Real phone conditions" |
| W6 | Media volume at zero | Critical | Raised to 50% at start if under 30%, with one vibration | "Real phone conditions" |
| W7 | Sold out, a close match is there | High | Offer the alternative; guide only after yes | Screen 27 |
| W8 | Wrong shelf altogether | High | Say so and point to staff or a helper | Screen 28 |
| W9 | Several identical targets | High | Guide to the nearest and say how many | Screen 29 |
| W10 | Speaking speed fixed | High | "Speak faster" / "speak slower", remembered | Commands; "Real phone conditions" |
| W11 | Listening for "Ittro" never ends | High | 2 minutes after done or stop, then pause fully | Screen 26 |
| W12 | Wrong product: what to do with it | High | "Put it back" in the no line | Screen 07 |
| W13 | Sweeping too fast | Medium | "Slower", once | Silence budget |
| W14 | Low battery or a hot phone | Medium | Said once; slow camera reads when hot | "Real phone conditions" |
| W15 | A shopping list | Medium | Confirmed as a list; "Next: …"; "skip" | Screen 30 |
| W16 | TalkBack speech can't be cut off or ranked | Medium | Day-1 test of TalkBack vs Ittro's own voice; keep the one that interrupts well | "TalkBack" |

A walkthrough by the designer is not a test with blind shoppers. Both research results ask for 5–10 blind users in a real shop before the design is called finished; plan that before the demo if possible.

## Outside the design (product and research questions)

These came up in both results but are not design questions. They stay for after the hackathon:

- Darija recognition (best published Algerian WER 39–54%).
- Counter-served épiceries in Algeria, where the shopkeeper fetches goods.
- Cost and data use.
- Testing with 5–10 blind users in a real shop, and retention.
- SAM 3.1's weakness on fine-grained variants, which the design answers by never saying "yes" without a fresh read of the held product.
