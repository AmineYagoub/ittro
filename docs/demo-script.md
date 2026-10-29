# Ittro demo video script (3 minutes)

One real search end to end in English: ask, confirm, guide, a wrong
bottle caught, the right one confirmed, a quick switch to Arabic,
and which Meta model does what. Total under 180 s. Every spoken
line below is a real Ittro line; timings are the edit budget, and
the on-screen timer shows the real elapsed time.

Cast: one shopper (the founder) holding the phone, one camera
filming over the shoulder. The phone screen is always visible:
every word on it is spoken. Meta models named: Muse Spark,
SAM 3.1, Muse Voice Transcribe, MMS-TTS. No other model is named.

## Shot list

| # | Time | Camera shows | Shopper says | Ittro says and shows | Meta model working |
|---|---|---|---|---|---|
| 1 | 0:00–0:12 | Shelf with water bottles. Phone screen: Welcome. Timer starts. | "I'm looking for Masaad water, the big bottle." | "You asked for Masaad water, 1.5 litres. Is that right? Say yes or no." | Voice Transcribe hears the sentence; Spark understands the request. |
| 2 | 0:12–0:25 | Over the shoulder: dashed outlines appear on bottles while the question is still up. | "Yes." | "I see two bottles. Reading their labels. Hold the phone steady." | SAM 3.1 outlines every product; Spark reads each label. Outlines started before "yes": the search runs while Ittro asks. |
| 3 | 0:25–0:55 | Green outline on the Masaad 1.5 L bottle with its name pill. The shopper's free hand enters the frame. | — | "Masaad is to your right. Move your hand right." Ticks speed up as the hand nears. "Almost there." | Hand tracking runs on the phone. The cues are MMS-TTS recordings. |
| 4 | 0:55–1:10 | Fingertip covers the green outline. | "Got it." | "Pick it up." then "I'm checking." | Spark reads the held bottle from a fresh photo. |
| 5 | 1:10–1:30 | Red screen, white cross, crop of a Guedila bottle. The founder holds up the wrong bottle to the camera. | (picked the neighbour by mistake) | "No. This is Guedila water. Put it back. Masaad is to your right. Say guide me, or read again." | Spark compared the label against every asked attribute and refused the yes. |
| 6 | 1:30–1:50 | Green outline again, hand guided back, founder picks the Masaad bottle. | "Is this the right one?" | "Yes. This is Masaad water, 1.5 litres. Say find another, or done." Verdict chime, two buzzes. | Spark matched brand and size on a fresh read. |
| 7 | 1:50–2:15 | Screen mirrors right-to-left; indicator moves top-right. | "Speak Arabic." | «حسناً، سأتكلم بالعربية الآن. قل English للعودة إلى الإنجليزية.» Then "English." → "Okay, I'll keep speaking English." | Spark understands the switch in any of the three languages; Transcribe stays biased to all three. |
| 8 | 2:15–2:45 | Title cards over the Found screen. Shopper silent. | — | (silent cards, read by the narrator) "Every answer is checked: same step, same hand, not too old. A wrong yes is the worst outcome, so 'I can't confirm yet' always beats a guess." | Card: Transcribe listens · Spark understands and reads · SAM 3.1 finds · MMS-TTS speaks. |
| 9 | 2:45–3:00 | Logo, repo link, timer stops. | "Done." | "Okay. Say Ittro when you need me." | — |

## Phone numbers (fill after the phone runs, never invent)

- Real timings this take: confirm Xs, first outline Ys after yes, wrong-bottle no Ys, final yes Zs from the confirmed request.
- 10-product set: found N/10, wrong yes M (must be 0), verdicts under 30 s.
- 20-minute session: battery drain N%, memory growth N MB, heat alerts N.

See [measure.md](measure.md) for how each number is collected and
[BUILD_LOG.md](BUILD_LOG.md) for the dated log.
