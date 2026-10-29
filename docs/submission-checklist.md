# Submission final check

Run this list in order before submitting (deadline 4 November 2026,
21:00 ET = 5 November 03:00 in Algeria; aim for 3 November).
Each item shows its exact command or step. Items marked [LOCAL]
were run on the Mac during preparation; the rest need the founder
or Claude. Publish nothing until every item passes.

## Secrets ([LOCAL] passed 29 Oct)

```bash
git log --all --oneline -- relay/.dev.vars app/.env .env   # must print nothing
git grep -n "AKIA\|BEGIN.*PRIVATE\|xoxb-\|ghp_" $(git rev-list --all) -- .  # must print nothing
git status --short  # .dev.vars, .env, *.log, reports/ must not be listed
```

Also open `relay/wrangler.jsonc`: only the Meta base URL, budget
and limits may sit in `vars`; `META_API_KEY` and `APP_ACCESS_CODE`
live only in gitignored `relay/.dev.vars` or `wrangler secret put`.

## History and build log ([LOCAL] passed 29 Oct)

```bash
git log --format="%ad %s" --date=short  # every commit dated 26 Oct 2026 or later, except none
grep -c "^- " docs/BUILD_LOG.md  # each phase 3–8 lands on its date; compare against the log above
```

Every commit message follows `docs/contributing/commits.md`
(Conventional Commits subject, listed scope, `Assisted-by:` trailer;
only the submitter adds `Signed-off-by:`).

## Licences ([LOCAL] passed 29 Oct)

```bash
ls relay/licenses/SAM-License.txt  # the SAM License copy ships with @meta-sam/parser
grep -n "MMS-TTS" README.md  # CC BY-NC 4.0 credit to Meta present
grep -n "MIT" README.md LICENSE  # MIT licence present
```

## Links ([LOCAL] passed 29 Oct)

Every relative link in `README.md`, `docs/demo-script.md`,
`docs/submission-text.md` and `docs/BUILD_LOG.md` resolves to a
file in the repo. Re-check after the phone numbers land:

```bash
for f in README.md docs/BUILD_LOG.md docs/demo-script.md docs/measure.md docs/submission-text.md; do grep -o "]([^)http#][^)]*)" $f | tr -d "](" | tr -d ")" | while read l; do t="${l%%#*}"; d=$(dirname $f); [ -e "$d/$t" ] || [ -e "$t" ] || echo "BROKEN in $f: $l"; done; done; echo DONE
```

## Tests and lints ([LOCAL] passed 29 Oct)

```bash
cd app && npx tsc --noEmit && npm run lint && npm test      # 227/227
cd ../relay && npm test && npm run lint                      # 84/84
cd ../modules/ittro-sensors && npm run lint
cd ../app/android && ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew assembleDebug -x lint --offline
```

## Public repository (founder)

1. On GitHub, open the repository Settings → General → Danger Zone → Change visibility → Make public.
2. Confirm in a logged-out browser: `https://github.com/AmineYagoub/ittro` shows the README, `docs/BUILD_LOG.md` and `relay/licenses/SAM-License.txt`.
3. Confirm no secrets are visible: search the repo on GitHub for `META_API_KEY`, `APP_ACCESS_CODE`, `.dev.vars`.

## Demo video (founder)

1. Film shot by shot from [docs/demo-script.md](demo-script.md); keep it under 3 minutes with the on-screen timer real.
2. Upload unlisted or public; open the link in a logged-out browser and press play: it must play for anyone, no sign-in.
3. Paste the final link into [docs/submission-text.md](submission-text.md) where marked, and the real take timings into the script's phone-numbers table.

## Phone numbers (Claude + founder)

1. Run [docs/measure.md](measure.md): the 20-minute session, then the 10-product set.
2. Fill the placeholders in `README.md` ("Phone numbers") and `docs/demo-script.md` ("Phone numbers") with the measured values only.
3. Re-run the tests, lints, links and history checks above, then commit (no push until the founder says so).

## Submit (founder)

1. Paste [docs/submission-text.md](submission-text.md) into the Cerebral Valley form, one section per field.
2. Attach the video link and the public repo link; submit before 21:00 ET, 4 November 2026.
