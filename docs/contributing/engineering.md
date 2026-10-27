# Engineering rules

These rules put the PRD's principles into code. A pull request that breaks one is not merged, however good it is otherwise. If a rule seems to block something teachers need, open an issue. Rules change through a decision record, never quietly in code.

- [Pupil data and privacy](#pupil-data-and-privacy)
- [Secrets](#secrets)
- [Test data](#test-data)
- [If something leaks](#if-something-leaks)
- [Tests](#tests)
- [The apps](#the-apps)
- [Code style](#code-style)
- [Dependencies](#dependencies)
- [Licences in every file](#licences-in-every-file)
- [Security while building](#security-while-building)

## Pupil data and privacy

- **In teacher mode, pupil data leaves the device only** in the end-to-end encrypted sync or backup, and only when the teacher has turned it on. In the national system, the school's copy goes to the school's space, encrypted so that only the teacher and the school can read it. Marks, and absences where the school chooses, go to the state's systems, encrypted for them alone (principle 2, [PRD §1.5](../prd/PRD.md#15-pupil-data-and-privacy-rules)).
- **Every network call is listed in `NETWORK.md`,** with the address, what is sent and why. Adding or widening a call is a privacy-sensitive change, and `NETWORK.md` changes in the same pull request.
- **No third-party code that sends data:** no analytics, advertising, crash-reporting or AI SDKs.
- **No proprietary libraries,** such as Google Play Services or Firebase, including any that another dependency pulls in. Anyone, F-Droid included, must be able to build the apps from source ([PRD §1.3](../prd/PRD.md#13-licences)).
- **Record layers are checked in code.** Every sync, export and share goes through the layer check, and tests prove that a private note cannot reach a statement ([PRD §5.4](../prd/PRD.md#54-where-each-record-may-go)).
- **Dates, never clock times.** Records and their history keep the day and the order of each change, never the time of day ([PRD §5.5](../prd/PRD.md#55-history-corrections-and-signatures)).
- **The minimum data.** Adding a pupil field changes a data flow, so it needs a decision record ([PRD §5.6](../prd/PRD.md#56-the-minimum-data)).
- **No pupil data in logs, notifications, crash reports or error messages.**
- **Every file that comes in is untrusted.** It is opened in isolation and checked against its format. Unknown fields are dropped, and macros are never run ([PRD §5.9](../prd/PRD.md#59-files-minhajna-reads-and-writes)).
- **Deletion is real.** Deleted content is erased. The history keeps only the fact that something was deleted, and the day ([PRD §5.5](../prd/PRD.md#55-history-corrections-and-signatures)).

## Secrets

- **Never in a repository,** not even for a moment. No keys, tokens or passwords in code, tests, examples, configuration or logs.
- **Secret scanning** checks every change ([PRD §1.9](../prd/PRD.md#19-official-builds-releases-the-name-and-security)).
- **Configuration examples** use placeholders, such as `SYNC_DB_PASSWORD=change-me`.

## Test data

- **Made-up data only** ([PRD §5.12](../prd/PRD.md#512-test-data)): the demo class, and made-up class lists, workbooks and FET files.
- **Made-up names should look real.** Use Algerian names in Arabic and Latin letters, including long names, names with a hamza, and pupils who share a family name, so the tests catch problems with shaping, sorting and duplicates. Never copy a real class.
- **Never commit a real file,** even one you anonymised by hand: no real class list, grade workbook, export or screenshot. Blank workbook templates from the field check enter the repository only after every pupil row is removed.

## If something leaks

When real pupil data or a secret reaches a public space:
- **Tell a maintainer at once,** privately ([SECURITY.md](../../SECURITY.md)). Don't draw attention to it in public.
- **A secret is revoked and replaced first.** Removing it from the history is not enough, because someone may already have copied it.
- **An issue or a comment is deleted, not edited,** because GitHub keeps the history of edits. An uploaded image stays reachable through its link, so the maintainer also asks GitHub Support to remove it.
- **A commit is removed from the history** of every branch that holds it, and GitHub Support is asked to purge its cached copies. This is the only time shared history is rewritten.
- **The author is told privately why** ([PRD §1.5](../prd/PRD.md#15-pupil-data-and-privacy-rules)).

## Tests

- **Every change in behaviour comes with tests.** A bug fix starts with a test that fails without the fix.
- **The rules, the formulas and the engine** are checked against the published test cases, which run in both apps ([PRD §5.2](../prd/PRD.md#52-architecture)).
- **Round trips.** Every export imports back and gives the same records ([PRD §5.12](../prd/PRD.md#512-test-data)).
- **Upgrades.** Database migrations and file formats are tested from every released version ([versioning.md](versioning.md)).
- **No test needs the network** or the project's servers.

## The apps

- **Arabic first, and right to left first.** Every text is translatable, and no text is written into the code. Layouts also work left to right ([PRD §1.14](../prd/PRD.md#114-algeria-first-flexible-for-other-countries)).
- **Country specifics are data, not code.** Never write an Algerian rule into the core. Curricula, calendars, levels, assessment rules and the layouts of official documents live in the data repository ([PRD §1.14](../prd/PRD.md#114-algeria-first-flexible-for-other-countries)).
- **Offline.** No daily task needs a network ([PRD §6.8](../prd/PRD.md#68-non-functional-requirements)).
- **Nothing is lost.** Every change is saved the moment it is made.
- **Accessible** ([PRD §6.8](../prd/PRD.md#68-non-functional-requirements)):
  - touch targets of at least 48 dp;
  - text can be enlarged to 200% without breaking a layout;
  - works with the screen reader in Arabic, French and English;
  - colour is never the only signal;
  - contrast meets WCAG 2.2 level AA.
- **Fast on a budget phone,** within the targets in [PRD §6.8](../prd/PRD.md#68-non-functional-requirements).
- **The shared core has no platform code,** so both apps run the same rules.

## Code style

- **TypeScript in strict mode.**
- **At most 300 lines in a file,** counting every line, blank lines and comments included, so that a contributor can read any file in one sitting. ESLint's `max-lines` checks TypeScript and JavaScript; reviews hold Kotlin, Gradle and workflow files to the same limit. A file that grows past it is split by what it does, never cut in the middle of a function or a test, and the core's index keeps its exports unchanged.
- **The formatter and linter settings in the repository decide style.** Don't argue about style in a review. Propose a change to the settings in its own pull request.
- **Names and comments in English,** using the PRD's English terms.

## Comments

A reader should meet the code's steps without comments between them, and find what the code can't say in one place: at the head. This follows the [Linux kernel coding style](https://www.kernel.org/doc/html/latest/process/coding-style.html#commenting) (comments say what a function does and why, at its head, not how, inside it), the [Google TypeScript style guide](https://google.github.io/styleguide/tsguide.html#comments-documentation) (document every top-level export with JSDoc) and the [Airbnb JavaScript guide](https://github.com/airbnb/javascript#comments) (no trailing comments).

- **Comments explain why,** not what. Good names say what.
- **Comments sit at the head:** a file header, and a doc comment (`/** … */`) on each export and on any field whose meaning is not plain from its name. A step that needs explaining goes into its function's head comment, or becomes a function of its own whose name says it.
- **No comments inside a function's body.** Two exceptions: a tool directive (`eslint-disable`, `@ts-expect-error`, `prettier-ignore`), which a tool reads where it stands, and a comment directly in a `describe` block that heads the test below it.
- **No comment on the same line as code.** It goes on the line above, at the head.
- **No commented-out code, and no TODO, FIXME, XXX or HACK.** Git keeps old code. Open an issue for work still to do, and link it from the pull request.

ESLint checks the TypeScript and JavaScript: the repository's own rule `minhajna/no-comments-in-functions` with `no-inline-comments`, `line-comment-position` and `no-warning-comments`. No linter tells commented-out code from prose, so reviews catch it. Reviews hold Kotlin, Gradle and workflow files to the same rules: a comment above a function, a block or a setting, never at the end of a line. The one exception is the version after a pinned action's commit hash (`uses: actions/checkout@<hash> # v7.0.1`), which Dependabot reads and updates where it stands.

## Dependencies

- **Every new dependency is justified** in its pull request, and approved by a maintainer. Fewer is better: each one adds size, risk and work.
- **Before adding one, check that it:**
  - has a licence from the list below;
  - is maintained;
  - is small enough for a small install ([PRD §6.8](../prd/PRD.md#68-non-functional-requirements));
  - makes no network calls of its own;
  - contains no proprietary code, and downloads no prebuilt binaries while installing, which would stop F-Droid from building the app.
- **The lockfile is committed,** and installs use it, so builds are reproducible.
- **Updates** arrive as automated pull requests, and are reviewed like any other change. During a freeze, only security updates reach a release branch.
- **Known vulnerabilities** are checked on every change and every release ([PRD §6.9](../prd/PRD.md#69-security-and-privacy-while-building)).

**Licences of dependencies**

| | Licences |
|---|---|
| Allowed | MIT, ISC, 0BSD, Zlib, BSD-2-Clause, BSD-3-Clause, Apache-2.0, MPL-2.0, LGPL-2.1-or-later, LGPL-3.0-or-later, GPL-3.0-or-later, AGPL-3.0-or-later. Also OFL-1.1 for fonts, and CC0-1.0, CC-BY-4.0 and CC-BY-SA-4.0 for data |
| Allowed by name | Code React Native's Android libraries are built with, already in the APK, and only for that code: libjpeg-turbo in Fresco under IJG, the LLVM support code in Hermes under Apache-2.0 WITH LLVM-exception and NCSA, and dtoa in Hermes under the dtoa licence. These licences are permissive and ask only for a notice, which travels in `assets/licenses/`. Any other code under them needs a decision |
| A maintainer decides | Licences limited to version 3, such as GPL-3.0-only or AGPL-3.0-only, which would tie the whole app to that version ([PRD §5.9](../prd/PRD.md#59-files-minhajna-reads-and-writes)). Also any licence not listed here |
| Refused | GPL-2.0-only, which cannot be combined with AGPL-3.0; non-commercial licences; "source-available" licences, such as SSPL or BUSL; anything proprietary |

## Licences in every file

The repositories follow the [REUSE specification](https://reuse.software/) ([PRD §1.3](../prd/PRD.md#13-licences)).
- **Every source file starts with** its copyright and licence, using the year the file was created:

  ```ts
  // SPDX-FileCopyrightText: 2026 The Minhajna contributors
  // SPDX-License-Identifier: AGPL-3.0-or-later
  ```

- **Documents** are licensed CC-BY-SA-4.0.
- **Files that cannot hold a comment,** such as images, JSON and test files, are covered in `REUSE.toml`.
- **Code copied from elsewhere** keeps its own copyright and licence lines, and its licence must be on the allowed list. Its licence text goes in `LICENSES/`, and the pull request says where the code came from.
- **Official texts and plans are never relicensed.** They are included only when counsel clears them ([PRD §1.3](../prd/PRD.md#13-licences)).
- **`reuse lint`** runs on every change.

## Security while building

- **A published threat model,** updated with each major change ([PRD §6.9](../prd/PRD.md#69-security-and-privacy-while-building)).
- **Two-factor authentication** for every maintainer ([PRD §1.8](../prd/PRD.md#18-governance-and-decisions)).
- **Maintainers sign the release tags they make.**
- **Checks that run a contributor's code never have access to secrets.**
- **Security reports** follow [SECURITY.md](../../SECURITY.md).
