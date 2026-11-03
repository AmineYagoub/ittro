# Contributing

Thanks for helping. Newcomers are welcome: you don't need to be an expert, and no question is too small.

## Find something to work on

- Issues labelled [good first issue](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are small and well described. [help wanted](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) issues need more context but are ready for anyone.
- **Comment `/take` on the issue** to have it assigned to you, and start straight away: you don't need to wait for a maintainer. If someone already has it, the bot says who, so pick another one. The first `/take` wins.
- If you stop, comment `/drop` so someone else can take it. A maintainer may free an issue that has had no pull request or update for 7 days.
- For anything bigger than a small fix, open an issue first and agree on the approach.

## Set up

You need Node 22 and npm. To build the Android app you also need JDK 17 and the Android SDK (with `ANDROID_HOME` set); the tests and lints run without it.

```bash
git clone https://github.com/AmineYagoub/ittro
cd ittro
(cd app && npm install)
(cd relay && npm install)
node app/scripts/fetch-hand-model.mjs   # MediaPipe's hand model, checked against its pinned hash
```

## Run the checks

These are the checks CI runs on every pull request, so a pull request that passes them here passes there too:

```bash
(cd app && npx tsc --noEmit && npm run lint && npm test)
(cd relay && npm run typecheck && npm run lint && npm test)
(cd modules/ittro-sensors && npm run lint)
```

CI also builds a release APK from a fresh `npx expo prebuild`. To build one yourself:

```bash
cd app && npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease -x lint -PreactNativeArchitectures=arm64-v8a
```

Try a change on a real Android phone over wireless adb. To use your own relay, create `relay/.dev.vars` (it is gitignored) with `META_API_KEY` and `APP_ACCESS_CODE`, run `npx wrangler dev` in `relay/`, and build the app with `EXPO_PUBLIC_RELAY_URL` and `EXPO_PUBLIC_ACCESS_CODE` set. Never commit a key or a code.

## Find your way around

| Folder | What lives there |
|---|---|
| `app/src/conversation/` | The statechart: talking, listening, understanding, and the routing table for every sentence |
| `app/src/shelf/` | The shelf search: photos, the find, outlines and the sweep |
| `app/src/guide/` | Hand guidance: cues, ticks, the reach and the pick-up |
| `app/src/confirm/` | The check of the product in the hand |
| `app/src/helper/` | Asking a sighted helper |
| `app/test/` | The app's tests, run by `node --test` against stubs of the native modules |
| `modules/ittro-sensors/` | The Kotlin native module: mic, camera frames, hand tracking, the outline that follows the phone |
| `relay/src/` | The Cloudflare Worker: one file per route, and the gate every route passes |
| `docs/design/` | The design: [DESIGN.md](docs/design/DESIGN.md) is the spec, with the screens, sounds and voice cues |
| `docs/decisions/` | Decision records |

The whole app is one XState statechart. `live` holds seven parallel regions; `paused` (a call, a lock, another app) and `over` sit beside it:

```text
conversation
├── live (parallel)
│   ├── talk:    boot → first launch → saying ⇄ listening → understanding → routing
│   ├── silence: quiet → waiting → reminding (8 s, 20 s, 60 s)
│   ├── search:  idle ⇄ active
│   ├── guide:   idle → aiming → directing → almost → reaching → picking
│   ├── confirm: idle → checking → yes / no / unsure / picture / giveup
│   ├── helper:  idle → pairing → waiting → answered
│   └── link:    ok / down / limited / broken
├── paused → "Welcome back. Still looking for …"
└── over   → "Say Ittro when you need me."
```

## Send a pull request

1. Fork the repository and create a branch from the default branch.
2. Make one change per pull request, with a test when you change behaviour.
3. Run the tests and the linter.
4. Open the pull request, say what it changes and why, and link the issue (`Closes #12`).
5. Give it a title in the [Conventional Commits](https://www.conventionalcommits.org) form, `type: what it does`:

   | Title | When |
   |---|---|
   | `fix: wrong code for Adrar` | A bug fix |
   | `feat: add postal codes` | A new feature |
   | `feat!: rename the code field` | A change that could break someone who uses the project |
   | `docs: explain the setup` | Documentation only; also `test:`, `ci:`, `chore:`, `refactor:`, `build:`, `style:`, `perf:` |

   A scope in brackets is optional: `fix(api): …`. A check fails until the title fits, and you can edit the title at any time.

Pull requests are squash-merged, so the title becomes the commit's message, and the changelog and the next version are made from it: don't edit `CHANGELOG.md` yourself.

## Review

- A maintainer reviews every pull request; we may ask for changes, which is normal.
- **On your first pull request, CI waits until a maintainer approves the run.** That's GitHub's safety setting for first-time contributors, not a judgement on your change. Once a pull request of yours is merged, CI runs on its own.
- Answer review comments with new commits rather than a force-push, so the conversation stays readable. The squash merge tidies the history.
- A maintainer merges once CI passes and every conversation is resolved.
- Nothing is closed automatically. If a pull request goes quiet for a long time, we ask before we close it.

## AI-assisted contributions

You're welcome to use AI coding tools, on these terms:

- **You are the author.** Understand every line you submit, and be ready to explain it in review. "The model wrote it" doesn't answer a review comment.
- **Say so.** Tick the AI box in the pull request template, and name the tool and what it did. A commit may credit it in a `Co-Authored-By:` or `Assisted-by:` trailer.
- **Run the checks yourself,** and report the results you actually got.
- **Point your agent at [AGENTS.md](AGENTS.md).** Most coding agents read it on their own, and its rules bind them as they bind you.
- **No autonomous agents.** A person writes or reviews every issue, pull request and comment; an agent may not open them on its own.
- **Check what a tool finds** before you report it, and report security problems privately. An unchecked report is closed.
- **Keep private things out of AI tools:** unpublished security reports, other people's personal data, and any secret.
- Maintainers may close a low-effort generated pull request or issue without a detailed review.

## Who decides

The maintainer, [Amine Yagoub](https://github.com/AmineYagoub), sets the project's direction, reviews and merges pull requests, publishes releases and handles security reports. What the project does next is proposed in an issue, where anyone can comment; the maintainer decides and says why. A change to a principle, a licence, a data flow or money needs a [decision record](docs/contributing/workflow.md#decision-records). Steady, careful contributions and reviews can lead to an invitation to help maintain.

## Our pledge

The maintainers reply to every newcomer's pull request within 7 days, even if only to say when we'll review it.

## Conduct and security

Everyone follows the [code of conduct](https://github.com/djazairdev/.github/blob/main/CODE_OF_CONDUCT.md). Report security problems privately, as [SECURITY.md](https://github.com/djazairdev/.github/blob/main/SECURITY.md) says, never in a public issue.

## Licence

The project is released under its [licence](LICENSE). By submitting a contribution, you agree that it's released under the same terms, as section D.6 of [GitHub's Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) provides, and that you have the right to submit it. Don't submit code you didn't write unless its licence allows it to be released under the project's, and say where it came from.
