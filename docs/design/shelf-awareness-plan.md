# Shelf awareness: ask what's in view, sweep the shelf, and what to say when it isn't here

Plan of 1 Nov 2026. Built after phone test t16 passes (find → guide → confirm on the real shelf). Nothing here touches that path: each part is a new request type or replaces a line, and each can be cut on its own.

## Why

Replaying the founder's shelf video showed that one look at a shelf answers more than "is my product here?": what is on it, which is cheaper, what is closest to what I wanted. A sighted shopper gets that at a glance. Ittro reads every bag on the shelf on each pass and throws that away except for one yes or no.

And when the product is not in view, Ittro today alternates "turn right", "turn left" with no memory of where the phone already looked, then gives up with "it isn't here".

## What the shopper gets

| The shopper says or meets | Ittro says (Arabic shown, French and English the same) |
|---|---|
| "شنو كاين هنا؟" (what's here?) | "على هذا الرف أرى أرز أبيض، أرز بسمتي، وفاصوليا بيضاء." |
| "أيهم أرخص؟" (which is cheaper?) | "أرز أبيض بـ220 دينار. لا أستطيع قراءة سعر البسمتي." |
| "واش كاين العسل؟" (is there honey?) | "نعم، برطمانات عسل في الرف السفلي. هل تريد أن آخذك إليها؟" |
| "نعم" (after an offer) | The normal find → guide → confirm for that product. |
| Product not in view | "لا أرى بسمتي هنا. أدر الهاتف ببطء إلى اليمين… توقف." then left, then down, never twice over the same place. |
| Whole reach checked, not there | "فحصت الرف كله. لا يوجد بسمتي. أرى أرز أبيض وفاصوليا. هل تريد الأرز الأبيض؟" |
| Wrong part of the shop | "هذا رف البسكويت. اسأل شخصًا قريبًا عن الأرز، وعندما تصل قل ابحث من جديد. أو قل اسأل [المساعد]." |

## Rules

- **Voice only, never silent.** Every question gets "let me look" with the working tick while the answer is fetched.
- **Never a guess.** Only text the model can read is repeated. A price is said only when its tag clearly belongs to that product; otherwise Ittro says it can't read it. Reflections and pictures are never products (the read rule already holds this).
- **Say what the camera covers.** Answers start from "on this shelf" so "there is no honey" is never mistaken for "the shop has no honey".
- **A choice still ends in the hand.** Any product picked from an answer goes through the in-hand check before the green yes.
- **No new data flow.** The same still that goes to Meta for the shelf read goes with the question. This is `server` scope and privacy-sensitive: the founder reviews it before it is pushed.

## First: two changes from the Meta API audit (1 Nov)

### A. `store: false` on every Meta call

The Responses API stores every response unless the request says `store: false` (dev.meta.ai/docs/protocols/responses). The relay never says it, so Meta keeps every shelf photo and hand crop. `relay/src/spark.ts` (all Muse Spark calls) and `relay/src/sam.ts` (all SAM calls) each gain `store: false`, with a test that the request body carries it. Both models accept it (probed 1 Nov, http 200).

### B. Find by grounding, then a SAM box prompt

Muse Spark can return the box of a named object on a 0–1000 grid (image understanding, "perception grounding"). SAM 3.1 can cut the object inside a given box (`<0f>1<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|>`, up to 16 boxes per call). Together they replace today's first pass (package phrase, SAM on every package, crop reads in two batches).

Replay on the founder's shelf video (21 frames × 8 Arabic requests, run twice, both runs the same):

| | Today's search (11 frames) | Grounding + box prompt (21 frames) |
|---|---|---|
| Right when the product is in view | all but Bifa on f018 | 78 of 79 (Bifa on f018, a sliver) |
| Right when it is not | all | 80 of 80 (no invented product) |
| Calls per find | 3–4 (phrase, SAM, 1–2 reads) | 2 (grounding, SAM) |
| Time to the outline | 8–12 s first pass, 3–7 s after | median 3.7–4.1 s, p90 5.2–5.8 s, from the first pass |

Two prompt rounds were needed. The first invented four Masaad bottles on honey jars and returned the request as the label. Asking for the printed name, never the request's words, plus an `is_requested` flag fixed that. A general request (rice) must match every variety and a named variety (basmati) only itself, or rice missed 4 frames. The prompt that passed is in `ground-replay-v3.mts` (scratchpad, 1 Nov) and moves into `relay/src/find.ts`.

The design:

- A relay route `POST /find` does grounding (Muse Spark, minimal effort, strict schema) then one SAM call with every returned box, and answers outlines in today's `ShelfOutline` shape with `brand_text` from the printed name. The app's shelf loop calls it in place of phrase + outline + reads for a fresh shelf.
- The tracking, the guide, refind, carry and the in-hand check stay as they are. Rechecks keep the crop reads, which hold the refind rules.
- `metadata.include_confidence` is read but not used to filter: the invented bottles scored 0.89–0.98, so confidence can't catch a wrong name.
- The old path stays behind a flag until phone test t17 shows the new one at least as fast on the phone, and never with a wrong yes.

It also makes "ask, then go" (part 3) instant: the ask answer can carry the box of the product it offers.

## Design

### 1. Shelf inventory (shared, no extra call)

Every shelf read already returns, per crop, `spoken`, `brand_text` and `size_text`. Keep them per search in the loop state: a list of distinct products seen, with how often each was read and where (the outline box and the camera pan at that moment). New file `app/src/shelf/inventory.ts`.

Used by: the not-here summary (part 4) as the list to offer, and the ask route (part 2) as a hint next to the picture.

### 2. Ask what's in view

- **Intent.** `relay/src/understand.ts` gets `ask_view` with a `question` field: a question about what the camera sees (what's here, which is cheaper, is there X here, how many, what's the price of X on this shelf). "I want honey" stays `request_product`. "Where is the Basmati" with a pending request stays `where_is_it`.
- **Relay route** `POST /ask-view` in a new `relay/src/askView.ts`: input the sharpest recent still, the question, the language, the inventory names. Muse Spark with minimal effort and a JSON schema:
  - `answer`: at most two short sentences for speech, in the shopper's language;
  - `offer`: the product to take the shopper to, as a request text, or null;
  - `unreadable`: what the shopper asked about that could not be read.
- **Prompt rules.** The rules above, plus: name products the way the label names them; prices with the currency as printed; when the question names something not in view, say it's not on this shelf.
- **App.** A new slice `app/src/conversation/askView.ts`: understanding → asking (holding line, working tick, a 15 s timeout with a spoken failure) → saying the answer → listening. A new `askView` in `app/src/relay.ts`.

### 3. Ask, then go

When the answer has an `offer`, the answer ends with "do you want me to take you to it?" and the chips are yes and no. Yes sends `request_product` with the offer as `product_text`. The search then starts with the carry from the last pass (same camera, no new outline), so the find takes about 2–5 s, not 8.

### 4. Sweep with memory

New `app/src/shelf/sweep.ts`, replacing the alternating `SHELF_TURN`:

- **Coverage from the camera.** The native flow already measures the pan (`cameraPan()`, frame units since the camera opened). The view offset is −pan (turning the phone right moves the picture left). The sweep keeps the stretch of offsets it has read.
- **Steps.** Right in steps of 0.6 of a frame (so views overlap) up to +1.2, then left down to −1.2, then down 0.5 (the shelf below). At each step: "turn slowly right" … "stop" when the offset reaches the target, then a read pass on a sharp still. Faster than half a frame a second: "slower".
- **Ends.** A yes anywhere → the normal found and guide flow. The full reach read with no yes → part 5. A new camera session (app sent to the background) starts the sweep again.
- **Walking.** After the full reach, when the shelf continues (outlines at the edge of the view at the ends of the sweep): "take two steps to the right and point the phone at the shelf again", and the sweep restarts there.

The spoken lines go in a new `app/src/shelf/sweepLines.ts` (searchLines.ts has room for two lines, not ten).

### 5. Not here: say what is

At the end of a sweep, or on `SHELF_SWEPT`, Ittro calls `/ask-view` with an internal question: "the shopper wants X; it is not here; name the closest product in view, if any." It speaks the answer with the inventory (at most three products) and the offer, and it keeps the chips keep looking, find another, ask the helper. This replaces the word-overlap `CLOSE_MATCH`, which never matches across scripts (Arabic request, French label).

### 6. Somewhere else in the shop

Ittro has no store map and says so through what it offers:

- **The shelf kind.** The scene check already returns `kinds` and `aisle_hint`: "this is the biscuit shelf".
- **Ask someone nearby.** "Ask someone nearby where the rice is. When you're there, say look again." The shopper's "look again" (`keep_looking`) restarts the sweep at the new shelf.
- **The helper.** The existing `ask_someone` sends the still to the paired helper.

### 7. How it sounds: closer to a person

From the 1 Nov research on what makes Gemini Live feel natural. Gemini Live itself is not used: it would replace Meta's transcription and Muse Spark, and the judges check that Meta's models are used. These copy its qualities on the Meta stack.

1. **One call for a question.** While the camera is on a shelf, the understanding call carries the sharpest still. When the sentence is a shelf question, Muse Spark answers it in the same call (`ask_view` plus `answer`, `offer`, `unreadable`). That takes about 2.5–3.5 s, where understanding then asking takes 4–7 s. `/ask-view` stays for the not-here summary (part 5) and for the case without a fresh still.
2. **Something within half a second.** When the shopper stops talking, a short acknowledgement plays at once ("نشوف…", "لحظة…", "voyons…", "let me look…") with the working tick, chosen at random from a few per language so it never sounds canned. Then the answer follows.
3. **Written answers, fixed safety lines.** Answers to questions and the not-here summary are written by Muse Spark to a voice style in the prompt: at most two short sentences, no lists, everyday words, the shopper's own dialect mirrored (Darija in, light Darija out), numbers and prices said the way people say them. Hand cues, the green yes and the in-hand verdict stay as fixed lines: a blind shopper needs those predictable.
4. **Memory for follow-ups.** Each question carries the last three or four exchanges and the shelf inventory (part 1), so "أيهم أرخص؟" then "خذني إليه" or "والآخر؟" resolve. After a barge-in, the history holds only the part of the answer that was actually spoken.
5. **Tone that follows the shopper.** The call is told when the shopper repeated themselves or said "لا لا" in the last turns; the answer is then shorter and calmer, and offers help.
6. **The shopper stays in control.** "Faster", "slower" and "shorter" (already intents) apply to written answers too, and the sounds stay: research on blind users backs earcons and fast speech even where commercial voice guidelines discourage them.

**The voice.** Meta has no speech synthesis (Voice Transcribe only transcribes), so every language is spoken by Android's engine today (`app/src/speechEngine.ts`: `en-US`, `fr-FR`, `ar-SA`).

- **Voice A first.** List the installed voices (`Speech.getAvailableVoicesAsync()`) and pick the most natural per language: neural or network voices first, an Algerian or Maghreb Arabic one if present. It is logged at start so phone runs show which voice spoke.
- **Voice B if A still sounds robotic.** Azure neural voices through the relay, streamed: `ar-DZ-AminaNeural` or `ar-DZ-IsmaelNeural` (Algerian), and the matching French and English voices. This is a new service and a new data flow (the reply text goes to Azure), so it needs a decision record the founder approves, a key outside git, and a fallback to voice A when Azure is slow or down.

**Decision records.** Voice behaviour and data flows both need a record the founder decides (`docs/contributing/workflow.md`). Part 7 and voice A change how Ittro talks, so one record covers them before step 1; voice B gets its own.

**Targets, measured on the phone:** the first sound or acknowledgement within 0.5 s of the end of speech; the full answer within 3.5 s at the median.

## Files near the 300-line limit

`app/src/conversation/types.ts` (300), `actions.ts` (300), `routing.ts` (299), `answers.ts` (297) and `app/src/shelf/useShelfSearch.ts` (298) cannot grow. Step 0 moves the search event types out of `types.ts` and the search guards out of `routing.ts` into their own files before anything is added.

## Build order

Each step is one commit with its tests; lint, tsc and the relay tests pass before the next.

| Step | What | Files | Est. |
|---|---|---|---|
| A | `store: false` on Spark and SAM, with a test | `relay/src/spark.ts`, `sam.ts`, tests | 15 min |
| B1 | `/find`: grounding then SAM box prompts, the v3 prompt, tests with a stubbed Meta | `relay/src/find.ts`, `index.ts`, `test/find.test.ts` | 1.5 h |
| B2 | Shelf loop finds through `/find` on a fresh shelf, old path behind a flag | `shelf/loop.ts`, `relay.ts`, `useShelfSearch.ts` | 2 h |
| B3 | Replay the video through the app's loop with `/find`, then phone test t17 | scratchpad harness | 1 h |
| C | Decision record for part 7 and voice A; voice A: pick and log the best installed voice per language | `docs/decisions/`, `speechEngine.ts`, a voice picker | 1 h |
| 0 | Split the full files, no behaviour change | `conversation/types.ts`, `routing.ts` → `searchTypes.ts`, `searchGuards.ts` | 30 min |
| 1 | `/ask-view` route, the voice style, history and tone hints (part 7, items 3–5), tests with a stubbed Meta | `relay/src/askView.ts`, `index.ts`, `test/askView.test.ts` | 1.5 h |
| 2 | `ask_view` intent and `question` field; the understanding call answers shelf questions when it carries a still (part 7, item 1) | `relay/src/understand.ts`, app answer type | 1.5 h |
| 3 | Ask slice: instant acknowledgement (part 7, item 2), answer, timeout, failure line | `conversation/askView.ts`, `relay.ts`, lines | 2 h |
| 4 | Ask, then go: offer chips → request with carry | `askView.ts`, `search.ts` | 1 h |
| 5 | Inventory from reads | `shelf/inventory.ts`, `loopReads.ts` | 45 min |
| 6 | Not-here summary on the end of a sweep | `loopReads.ts`, `askView.ts`, lines | 1 h |
| 7 | Sweep with memory, slower, stop, down, walk | `shelf/sweep.ts`, `sweepLines.ts`, `loopReads.ts` | 2.5 h |
| 8 | Somewhere else: shelf kind + ask someone + look again | `searchLines.ts`, `search.ts` | 45 min |
| D | Voice B (only if A falls short): decision record, Azure route, fallback to A | `docs/decisions/`, `relay/src/voice.ts`, `speechEngine.ts` | 3 h |

About 17 hours of building (20 with voice B), plus checks. Tiers, so the demo never waits on all of it (times in Algeria):

- **Tier 0 (privacy and the faster find):** A and B1–B3, right after t16. Phone-checked (t17) by 1 Nov 23:00.
- **Tier 1 (the demo moment):** C and steps 0–6. Phone-checked (t18) by 2 Nov 14:00.
- **Tier 2:** step 7, the sweep. Phone-checked (t19) by 2 Nov 20:00.
- **Tier 3:** step 8. By 2 Nov 20:00.
- **Voice B:** only if voice A sounds robotic in t18, and only after the founder approves its decision record.

Step A ships whatever happens to the rest.

A tier that misses its time is cut from the build that records the video, and the video keeps the path that passed.

## Offline checks (before the phone)

The replay harness from 1 Nov (frames of the founder's video, the app's own loop, the local relay) gets a question mode. Each question runs twice and must pass both times:

| Frame | Question | Must say | Must not say |
|---|---|---|---|
| f002 | what's here? | Riz blanc, Basmati | any product not on the shelf |
| f002 | which rice is cheaper? | 220 for Riz blanc, the Basmati price unreadable | a Basmati price |
| f012 | is there white beans? | yes, with an offer | — |
| f012 | is there honey? | yes, lower shelf | — |
| f021 | what's here? | white beans, the Bifa box | rice |
| f008 | is there Masaad water? | not on this shelf | "the shop has no…" |

Pass bar: 6 of 6, twice. Also a not-here run: "بسمتي" over frames f004–f008 (no Basmati in view) must offer Riz blanc or macaroni and invent nothing.

## Phone checks

- **t17 (tier 0).** On the shelf, the same requests as t16 through `/find`: the outline on the right product, time to the found line against t16, no wrong yes across ten requests, two of them for products not there.
- **t18 (tier 1).** On the shelf: "what's here?" → a correct list within 5 s of the question ending; "which is cheaper?" → an honest answer; "take me to it" → found, guided, green yes in hand. Ask twice more at other spots. Measured from the log: the acknowledgement within 0.5 s of the end of speech, the answer within 3.5 s at the median; and a follow-up ("والآخر؟") resolved from the history.
- **t19 (tier 2).** Start pointed away from the Basmati, ask for it, follow the cues only: Ittro must reach it without crossing the same stretch twice, and say "stop" where the reads happen. Then ask for a product that isn't there: the sweep ends, Ittro offers the closest one.

## Demo moment (if tier 1 passes)

"شنو كاين هنا؟" → the list → "أيهم أرخص؟" → "أرز أبيض بـ220 دينار…" → "خذني إليه" → guided → "نعم. هذا أرز أبيض." About 25 s, one continuous take.

## Risks

- **Wrong answers the shopper can't check.** Kept small by the rules and the offline table; anything bought still passes the in-hand check.
- **Shelf tags.** A tag between two products may be given to the wrong one. The rule makes the model say it can't tell rather than pick one.
- **Flow drift over a long sweep.** The pan is good over one or two frame widths (in t14 it measured the move as −0.103, which matched the screenshots). The sweep stays within ±1.2 and starts again at every request.
- **Pan direction.** The sign is checked on the phone in t19 before any line is trusted.
- **Time.** Tiers and the cut rule above.

## Not in this plan

A store map or aisle-to-aisle guidance, reading a whole shop, shopping lists across shelves, and prices compared across visits.
