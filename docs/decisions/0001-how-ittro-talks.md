# 0001: How Ittro talks about the shelf, and one voice per language

- **Status:** Proposed (1 November 2026). The lead maintainer decides.
- **Covers:** part 7 and voice A of [the shelf-awareness plan](../design/shelf-awareness-plan.md). Voice B (Azure) is not covered; it needs its own record.
- **Scope:** voice behaviour and a data flow, so a record comes first ([workflow.md](../contributing/workflow.md#decision-records)).

## Context

Until now every word Ittro says is a fixed line: the found line, the hand cues, the verdicts. That keeps the safety-critical moments predictable, but it cannot answer what a sighted shopper gets at a glance: what is on this shelf, which is cheaper, is there honey here.

Replaying the founder's shelf video showed that Muse Spark can answer those questions from the same still Ittro already sends for the shelf read. Research on what makes Gemini Live feel natural (1 November) named four qualities: an answer in one call, a sound within half a second, written answers in a spoken style, and memory for follow-ups. Gemini Live itself is not an option: it would replace Meta's transcription and Muse Spark, and the hackathon judges check that Meta's models are used.

The voice is the other half. The Model API has no speech synthesis. English and French cues are MMS clips, and sentences come from the phone's engine in another voice, so the two voices alternate.

## Decision

1. **Questions about the view are answered in Muse Spark's own words.** When the shopper asks what the camera sees, the answer is written by Muse Spark to a voice style: at most two short sentences, everyday words, the shopper's dialect mirrored, prices said the way people say them.
2. **Only what can be read.** A product, a price or a count is said only when it is read in the still. A price is said only when its tag clearly belongs to that product. Answers start from "on this shelf", so "there is no honey" is never heard as "the shop has no honey". Nothing about health, allergens or medicines is judged.
3. **The safety lines stay fixed.** Hand cues, the found line, the in-hand check and the green yes keep their fixed lines and sounds. A product picked from an answer goes through the in-hand check before any yes.
4. **One call for a question when it can.** While the camera is on a shelf and the sentence sounds like a question, the understanding call carries the sharpest recent still and answers in the same call. Otherwise a second call (`/ask-view`) answers it.
5. **Something within half a second.** When a question ends, a short acknowledgement ("لحظة…", "voyons…", "let me look…"), picked at random from a few per language, plays at once with the working tick.
6. **Memory and tone.** A question carries the last four exchanges and the products read on this shelf, so follow-ups resolve. When the shopper repeated themselves or said "no, no", the answer is shorter and calmer and offers help. After a barge-in only the first sentence of the answer is kept as said.
7. **Voice A.** Each language speaks with the most natural voice installed on the phone: enhanced and network voices first, an Algerian or Maghreb Arabic voice when there is one. The pick is logged at start. A voice that fails is dropped for the phone's default. The English and French cues stay MMS clips unless a phone comparison prefers the engine voice (`EXPO_PUBLIC_ENGINE_CUES=on` builds it).

## Data flow

No new service and no new kind of data. The still that already goes to Meta for the shelf read goes with the question, through the relay, with `store: false`. The question, the last four exchanges and the names of products read on this shelf go with it. Nothing is stored on the relay.

One case takes a photo that would not otherwise be taken. When the shopper asks with no shelf still from the last few seconds (the camera was off, or pointed elsewhere), Ittro opens the camera, says "point the phone at the shelf", takes one still and sends that. It is the same kind of photo the shelf read sends, and it goes only because the shopper asked. The camera stays on 20 s after the answer, so a follow-up question does not ask the shopper to point the phone again. It then closes, unless a search needs it.

## Consequences

- Answers vary from one ask to the next. Offline checks (six questions on the shelf video, each twice) and phone run t21 check that nothing is invented.
- A wrong answer to a question cannot become a wrong purchase: anything taken from an answer passes the in-hand check.
- Network voices need the internet, which Ittro needs anyway; a failure falls back to the default voice.

## Not chosen

- **Gemini Live:** replaces Meta's models.
- **Every line written by the model:** the fixed lines are what a blind shopper relies on at the shelf.
- **Voice B (Azure neural voices):** a new service that would receive every reply. Only if voice A still sounds robotic, with its own record.
