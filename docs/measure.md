# Ittro dependability: the numbers and how to collect them

The Mac proves the code runs. The phone proves Ittro works. This file
is the exact procedure for the two phone runs: Claude's 20-minute
session and the founder's 10-product set with Claude. Both produce a
saved log; `app/scripts/log-report.mjs` turns each log into the
report. Nothing here deploys, downloads or installs anything.

## Saving the log

Claude runs this on the Mac before each run, with the phone on
wireless adb and the app freshly installed:

```bash
adb logcat -c
adb logcat -v time > run-<date>-<name>.log
```

Keep capturing until the run ends (Ctrl-C). The file stays on the
Mac; never commit it (`/reports/` is gitignored, keep logs there).
Then:

```bash
node app/scripts/log-report.mjs reports/run-<date>-<name>.log
```

The report prints: timing per search (request confirmed, first
outline, hand on product, verdict), each Meta call with its
milliseconds, each spoken sentence, link episodes, and the session's
battery, heat and memory. A first outline with a negative delta is
good news: the speculative search outlined before the shopper said
yes.

## Run 1: the 20-minute session (Claude)

Target: 20 minutes of continuous shopping with no growing memory,
no heat warning and no low-battery warning from a full charge.

1. Charge the phone full. Note the start level (should be 100%).
2. Start the log capture above. Open Ittro, say what to find.
3. Shop for 20 minutes by voice: at least 5 different requests,
   one "find another", one silence of 10 s (Ittro asks again),
   one language switch ("speak Arabic", then "English" or French),
   one lock and unlock, one wrong product picked up (Ittro says no).
4. At minute 10, turn the phone's wifi and data off for 30 s, then
   back on. Ittro must say the lost-internet line once and recover
   on its own; the log must show a `down` link episode that ends.
5. Stop the capture. Run the report script on the saved log.

The run passes when the report shows: memory used flat (under
50 MB growth over the 20 minutes), no `heat` alert line, battery
drain under 15%, every link episode ends, and no wrong yes.

## Run 2: the 10-product set (founder with Claude)

Target: 10 real products found or honestly missed, zero wrong yes,
verdict under 30 s from the request.

Proposed set (founder substitutes what is on the shelf, keeping the
constraints: 10 products, two of the same brand in different sizes):

| # | Product | Size | Note |
|---|---------|------|------|
| 1 | Masaad water | 1.5 L |  |
| 2 | Masaad water | 0.5 L | same brand, different size |
| 3 | Guedila water | 1.5 L | neighbour brand, confusion risk |
| 4 | El Taaounia Riz Basmati | 1 kg |  |
| 5 | El Taaounia Riz Blanc | 1 kg | same brand, other variant |
| 6 | Candia milk | 1 L |  |
| 7 | Rouiba orange juice | 1 L |  |
| 8 | Aroma coffee | 500 g |  |
| 9 | Sim semolina | 5 kg | big bag, coarse outline |
| 10 | A grocery item the shop has run out of | — | must be an honest miss, never yes |

Steps per product:

1. Start the log capture (one file per product:
   `run-<date>-p01.log` … `run-<date>-p10.log`).
2. Ask for the product by voice ("I'm looking for …"); one clear product is searched at once, with no yes needed.
3. Follow Ittro to the shelf, pick the guided product, hold it up.
4. Record: found or not, wrong yes or not, verdict kind.
5. Stop the capture. Run the report script for the times.

The set passes when the ten reports show: no wrong yes anywhere,
each found product verdicts yes under 30 s from the
request, product 10 never verdicts yes, and products 1 and 2 are
told apart (wrong size is a no, not a yes).

## Reading the verdicts

Per search the report shows one line, for example:

```text
1. "Masaad water" epoch 1
   confirmed +41.5s, first outline -9.7s, hand on product 11.4s, verdict yes 17.1s
```

Deltas count from the request: the shopper's yes when Ittro asked
"Is that right?", or the moment a clear request started the search.
`verdict none` means Ittro never confirmed: check the log for the
last `confirm` and `state` lines before judging it a miss.

## Deploy note: the helper store

The relay keeps pairings, helpers and questions in a second KV
namespace, `ITTRO_HELPERS` (see `relay/wrangler.jsonc`), created
1 November 2026. The relay answers on its custom domain,
`ittro.djazair.dev`, which the deploy keeps in DNS. Its secrets
(`META_API_KEY`, `APP_ACCESS_CODE`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) are set with
`wrangler secret put`, never in the repo.
Local runs and tests without the binding fall back to memory.
