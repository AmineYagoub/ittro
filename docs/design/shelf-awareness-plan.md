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

## Files near the 300-line limit

`app/src/conversation/types.ts` (300), `actions.ts` (300), `routing.ts` (299), `answers.ts` (297) and `app/src/shelf/useShelfSearch.ts` (298) cannot grow. Step 0 moves the search event types out of `types.ts` and the search guards out of `routing.ts` into their own files before anything is added.

## Build order

Each step is one commit with its tests; lint, tsc and the relay tests pass before the next.

| Step | What | Files | Est. |
|---|---|---|---|
| 0 | Split the full files, no behaviour change | `conversation/types.ts`, `routing.ts` → `searchTypes.ts`, `searchGuards.ts` | 30 min |
| 1 | `/ask-view` route, schema, prompt, tests with a stubbed Meta | `relay/src/askView.ts`, `index.ts`, `test/askView.test.ts` | 1.5 h |
| 2 | `ask_view` intent and `question` field | `relay/src/understand.ts`, app answer type | 45 min |
| 3 | Ask slice: holding line, answer, timeout, failure line | `conversation/askView.ts`, `relay.ts`, lines | 2 h |
| 4 | Ask, then go: offer chips → request with carry | `askView.ts`, `search.ts` | 1 h |
| 5 | Inventory from reads | `shelf/inventory.ts`, `loopReads.ts` | 45 min |
| 6 | Not-here summary on the end of a sweep | `loopReads.ts`, `askView.ts`, lines | 1 h |
| 7 | Sweep with memory, slower, stop, down, walk | `shelf/sweep.ts`, `sweepLines.ts`, `loopReads.ts` | 2.5 h |
| 8 | Somewhere else: shelf kind + ask someone + look again | `searchLines.ts`, `search.ts` | 45 min |

About 11 hours of building, plus checks. Tiers, so the demo never waits on all of it:

- **Tier 1 (the demo moment):** steps 0–6. Done and phone-checked by 2 Nov 12:00 (Algeria).
- **Tier 2:** step 7, the sweep. By 2 Nov 18:00.
- **Tier 3:** step 8. By 2 Nov 18:00.

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

- **t17 (tier 1).** On the shelf: "what's here?" → a correct list within 5 s of the question ending; "which is cheaper?" → an honest answer; "take me to it" → found, guided, green yes in hand. Ask twice more at other spots.
- **t18 (tier 2).** Start pointed away from the Basmati, ask for it, follow the cues only: Ittro must reach it without crossing the same stretch twice, and say "stop" where the reads happen. Then ask for a product that isn't there: the sweep ends, Ittro offers the closest one.

## Demo moment (if tier 1 passes)

"شنو كاين هنا؟" → the list → "أيهم أرخص؟" → "أرز أبيض بـ220 دينار…" → "خذني إليه" → guided → "نعم. هذا أرز أبيض." About 25 s, one continuous take.

## Risks

- **Wrong answers the shopper can't check.** Kept small by the rules and the offline table; anything bought still passes the in-hand check.
- **Shelf tags.** A tag between two products may be given to the wrong one. The rule makes the model say it can't tell rather than pick one.
- **Flow drift over a long sweep.** The pan is good over one or two frame widths (in t14 it measured the move as −0.103, which matched the screenshots). The sweep stays within ±1.2 and starts again at every request.
- **Pan direction.** The sign is checked on the phone in t18 before any line is trusted.
- **Time.** Tiers and the cut rule above.

## Not in this plan

A store map or aisle-to-aisle guidance, reading a whole shop, shopping lists across shelves, and prices compared across visits.
