# Engineering rules

These rules put Ittro's principles into code. A pull request that breaks one is not merged, however good it is otherwise. If a rule seems to block something shoppers need, open an issue. Rules change through a decision record, never quietly in code.

- [Shopper data and privacy](#shopper-data-and-privacy)
- [Secrets](#secrets)
- [Test data](#test-data)
- [If something leaks](#if-something-leaks)
- [Tests](#tests)
- [The app](#the-app)
- [Code style](#code-style)
- [Dependencies](#dependencies)
- [Licences](#licences)
- [Security while building](#security-while-building)

## Shopper data and privacy

- **Pictures and audio leave the phone only** to Meta's models, through the relay, and to a chosen helper after the shopper says yes. Nothing else receives them, and the relay holds no Meta key of its own in the app: the phone never holds the key at all.
- **No picture is kept** on the phone or the relay after its answer arrives. A picture sent to a helper is kept only until they answer, or 30 minutes at most.
- **The camera and microphone run only** while Ittro is looking, guiding, or listening for an answer. Both stop on pause.
- **Every new network call is a privacy-sensitive change,** and the pull request says the address, what is sent and why.
- **No third-party code that sends data:** no analytics, advertising or crash reporting.
- **Spoken numbers are computed, never fixed.** A line like "I checked six products" states the actual number checked.
- **No shopper data in logs, notifications or error messages.**
- **Deletion is real.** A deleted picture or answer is erased, not hidden.

## Secrets

- **Never in a repository,** not even for a moment. No keys, tokens or passwords in code, tests, examples, configuration or logs.
- **Configuration examples** use placeholders, such as `META_API_KEY=change-me`.
- The Meta API key lives in the relay's secrets, which the maintainer handles. It is never asked for in an issue or a pull request.

## Test data

- **Made-up data only:** made-up product names, shelves and labels.
- **Made-up names should look real.** Use Algerian brand names in Arabic and Latin letters, including long names and names that differ by one letter, so the tests catch shaping and lookalike problems. Never copy a real shop's shelf.
- **Never commit a real picture or recording,** even one you anonymised by hand: no real shelf photo, no real shopper audio, no real screenshot.

## If something leaks

When shopper data or a secret reaches a public space:
- **Tell a maintainer at once,** privately. Don't draw attention to it in public.
- **A secret is revoked and replaced first.** Removing it from the history is not enough, because someone may already have copied it.
- **An issue or a comment is deleted, not edited,** because GitHub keeps the history of edits. An uploaded image stays reachable through its link, so the maintainer also asks GitHub Support to remove it.
- **A commit is removed from the history** of every branch that holds it, and GitHub Support is asked to purge its cached copies. This is the only time shared history is rewritten.

## Tests

- **Every change in behaviour comes with tests.** A bug fix starts with a test that fails without the fix.
- **The relay's schema gate** is checked against completed, refused, broken and off-schema answers.
- **No test needs the network** or Meta's servers. The relay tests stand in for Meta.
- **Phone behaviour is tested on the real phone,** over wireless adb, never on an emulator.

## The app

- **Voice first, no screen needed.** Every action is a spoken command. The screen mirrors the voice for low-vision shoppers and onlookers; nothing needs touch except Android's own permission dialogs.
- **Every word on screen is spoken.** The screen shows only the line being said.
- **Right to left where relevant,** with Arabic layouts mirrored and TalkBack usable in Arabic, French and English.
- **Colour is never the only signal:** each verdict has its word, its icon, its chime and its vibration.
- **Text can be enlarged** without breaking a layout.
- **Fast on a budget phone:** fresh hand positions at least 10 times a second, haptics under 100 ms after a local decision.
- **Finding and reading need Meta's cloud.** Hand tracking, recorded clips and the on-device voice keep working offline; the app says so when the network is down.

## Code style

- **TypeScript in strict mode, erasable syntax only** (`type`, `interface`, `import type`): no enums, namespaces, or parameter properties. The toolchain is pinned to TypeScript 6 until a parser supports TypeScript 7 ([AGENTS.md](../../AGENTS.md)).
- **At most 300 lines in a file,** counting every line, blank lines and comments included, so that a contributor can read any file in one sitting. ESLint's `max-lines` checks TypeScript and JavaScript; reviews hold Kotlin, Gradle and workflow files to the same limit. A file that grows past it is split by what it does, never cut in the middle of a function or a test.
- **The formatter and linter settings in the repository decide style.** Don't argue about style in a review. Propose a change to the settings in its own pull request.
- **Names and comments in English,** using the design spec's terms.

## Comments

A reader should meet the code's steps without comments between them, and find what the code can't say in one place: at the head.

- **Comments explain why,** not what. Good names say what.
- **Comments sit at the head:** a file header, and a doc comment (`/** … */`) on each export and on any field whose meaning is not plain from its name. A step that needs explaining goes into its function's head comment, or becomes a function of its own whose name says it.
- **No comments inside a function's body.** Two exceptions: a tool directive (`eslint-disable`, `@ts-expect-error`), which a tool reads where it stands, and a comment directly in a `describe` block that heads the test below it.
- **No comment on the same line as code.** It goes on the line above, at the head.
- **No commented-out code, and no TODO, FIXME, XXX or HACK.** Git keeps old code. Open an issue for work still to do, and link it from the pull request.

ESLint checks the TypeScript and JavaScript: `no-inline-comments` and `line-comment-position`. No linter tells commented-out code from prose, so reviews catch it. Reviews hold Kotlin, Gradle and workflow files to the same rules: a comment above a function, a block or a setting, never at the end of a line. The one exception is the version after a pinned action's commit hash (`uses: actions/checkout@<hash> # v7.0.1`), which Dependabot reads and updates where it stands.

## Dependencies

- **Every new dependency is justified** in its pull request, and approved by a maintainer. Fewer is better: each one adds size, risk and work.
- **Before adding one, check that it:**
  - has a licence from the list below;
  - is maintained;
  - is small enough for a small install;
  - makes no network calls of its own;
  - contains no proprietary code.
- **The lockfile is committed,** and installs use it, so builds are reproducible.
- **Known vulnerabilities** are checked on every release.

**Licences of dependencies**

| | Licences |
|---|---|
| Allowed | MIT, ISC, 0BSD, Zlib, BSD-2-Clause, BSD-3-Clause, Apache-2.0, MPL-2.0. Also OFL-1.1 for fonts, and CC0-1.0, CC-BY-4.0 and CC-BY-SA-4.0 for data |
| A maintainer decides | Any licence not listed here, including CC BY-NC 4.0. The MMS voice clips are CC BY-NC 4.0 and ship only under the open item in [BUILD_LOG.md](../BUILD_LOG.md) |
| Refused | GPL-2.0-only on its own; "source-available" licences, such as SSPL or BUSL; anything proprietary |

## Licences

- **Code is MIT,** as `LICENSE` says.
- **The English and French voice clips are Meta MMS-TTS,** licensed CC BY-NC 4.0: non-commercial use, with credit to Meta. The credit lives in the README.
- **Code copied from elsewhere** keeps its own copyright and licence lines, and its licence must be on the allowed list.

## Security while building

- **Two-factor authentication** for every maintainer.
- **Maintainers sign the release tags they make.**
- **Checks that run a contributor's code never have access to secrets.**
- **Security reports** go to a maintainer privately, never to a public issue.
