# Commit messages and sign-off

Every commit on `main` tells a later reader what changed and why. Most commits reach `main` as a squashed pull request ([workflow.md](workflow.md#merging)), so these rules apply to pull request titles too.

- [The format](#the-format)
- [Types](#types)
- [Scopes](#scopes)
- [The summary](#the-summary)
- [The body](#the-body)
- [Trailers](#trailers)
- [Sign-off](#sign-off)
- [AI-assisted work](#ai-assisted-work)
- [Good commits](#good-commits)
- [Examples](#examples)

## The format

We follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>): <summary>

<body: what changed and why>

<trailers>
```

For example:

```text
fix(export): leave locked cells untouched in the grade workbook

When a pupil had no mark, the workbook fill wrote an empty value into
the locked cell next to it, and Excel then refused to open the file.
The fill now skips locked cells entirely, as PRD §5.9 requires.

Fixes #214
Signed-off-by: Nour Benali <nour.benali@example.org>
```

Commits made before this guide don't follow it. They stay as they are, because shared history is never rewritten.

## Types

| Type | For | In the teachers' changelog? |
|---|---|---|
| `feat` | A new feature, or a new ability in an existing one | Usually |
| `fix` | A bug fix | Usually |
| `perf` | Faster or lighter, with the same behaviour | When teachers will notice |
| `refactor` | A change to the code that changes no behaviour | No |
| `style` | Formatting only | No |
| `test` | Tests only | No |
| `docs` | Documents: the PRD, decision records, specifications and this handbook | Only if teachers read them |
| `build` | The build, packaging and dependencies | When teachers will notice |
| `ci` | The automated checks | No |
| `chore` | Other upkeep that fits no other type | No |
| `revert` | Reverting an earlier commit | If the reverted commit was |

Translations use `feat(i18n)` for a new language, and `fix(i18n)` for corrections.

## Scopes

The scope names the part of the product that changes, not the file. It is optional, but use one whenever a change sits in one area. The list below is a start. It grows with the code, and the configuration of the commit checks holds the current list.

| Group | Scopes |
|---|---|
| Teacher features | `setup`, `today`, `roll-call`, `marks`, `export`, `documents`, `digest`, `sharing` |
| School features | `reader`, `timetable`, `school-mode` |
| The shared core | `core`, `engine`, `calendar`, `history`, `layers`, `formats` |
| Data leaving the device | `sync`, `backup`, `crypto`, `network`, `insights` |
| Platforms | `android`, `web`, `server` |
| Across the product | `i18n`, `a11y`, `deps`, `release` |
| Documents | `prd`, `decisions`, `design`, `contributing` |

Changes in the "data leaving the device" scopes are privacy-sensitive. So are changes to `export`, and to anything that reads or writes the school's official files ([workflow.md](workflow.md#review)).

## The summary

- **Start with a verb in the imperative,** as if completing "This commit will…": "add", "fix", "remove". Not "added" or "adds".
- **Lower case after the colon,** and **no full stop** at the end.
- **At most 72 characters,** type and scope included.
- **Say what changes for whoever uses it:** "keep a class on its pinned plan release", not "update engine.ts".
- **Mark a breaking change with `!`** after the scope, and explain it in a `BREAKING CHANGE:` trailer. For example: `feat(formats)!: write archive format 2.0`. What counts as breaking is in [versioning.md](versioning.md).

## The body

- **Explain why,** and what was wrong before. The diff already shows how.
- **Leave a blank line after the summary,** and wrap lines at 72 characters.
- **Link what the change follows:** a PRD section, a decision record or a specification.
- **Name anything a later reader must know:** a database migration, a new format version, a new network call, or a privacy-sensitive change.
- A one-line change with an obvious reason may have no body.

## Trailers

Trailers go together at the end, after a blank line.

| Trailer | When |
|---|---|
| `Fixes #123` | The commit closes an issue |
| `Refs #123` | The commit relates to an issue without closing it |
| `BREAKING CHANGE: <what breaks, and what to do>` | The summary is marked with `!` |
| `Co-authored-by: Name <email>` | Another person wrote part of the commit. They sign off too |
| `Assisted-by: <tool and model>` | An AI tool wrote a substantial part ([AI-assisted work](#ai-assisted-work)) |
| `Signed-off-by: Name <email>` | Always, from every person who wrote part of the commit |

## Sign-off

Every commit carries a `Signed-off-by` line under the [Developer Certificate of Origin 1.1](https://developercertificate.org/) (DCO), as [decision 0003](../decisions/0003-contributor-terms-dco.md) sets. With it, you certify two things:
- **You have the right to submit the change under the project's licence,** because you wrote it, or it builds on work under a compatible open-source licence, or someone who certified the same gave it to you unchanged.
- **The contribution and your sign-off are public,** and are kept for good.

How it works:
- **Add it** with `git commit -s`. Git takes your name and email address from its settings ([workflow.md](workflow.md#setting-up)).
- **Your name** is the name you are known by in the project, used consistently. It does not have to be your legal name, but it cannot be anonymous or a throwaway.
- **Your email address** is the same as the commit author's. A GitHub no-reply address is fine.
- **Forgot it?**
  - On the last commit: `git commit --amend --no-edit -s`
  - On every commit of your branch: `git rebase --signoff upstream/main`

  Then update your pull request with `git push --force-with-lease`.
- **The sign-off is not a cryptographic signature.** Signing your commits with GPG or SSH is welcome, but only the sign-off is required.
- **Content from the teachers' form.** The data curator who commits it signs it off, relying on the licence the teacher accepted in the form ([decision 0003](../decisions/0003-contributor-terms-dco.md)).
- **Dependabot's updates.** A bot cannot certify the DCO, so the check skips the commits Dependabot makes in the pull requests it opens. The maintainer who reviews and merges an update answers for it, and a commit that a person adds to it is signed off as usual.

## AI-assisted work

AI-assisted contributions are welcome ([PRD §1.7](../prd/PRD.md#17-contributions)).
- **You answer for them** like any other work: you reviewed and tested them, and you have the right to submit them.
- **Say so.** Mention it in the pull request, and add an `Assisted-by:` trailer when a tool wrote a substantial part. A `Co-authored-by:` trailer that your tool adds is fine instead.
- **The sign-off is always a person's.** A tool cannot certify the DCO, so it never signs off.
- **Never give an AI tool pupil data or secrets** (principle 2).

## Good commits

- **One logical change per commit.** If the summary needs "and", it is probably two commits.
- **Every commit that will be kept builds and passes the checks,** so any commit can be tested on its own when tracking down a bug.
- **Keep reformatting apart** from changes in behaviour.
- **Never commit:**
  - secrets, such as keys, tokens or passwords;
  - real pupil data, or anyone's personal data;
  - build output;
  - large binary files, unless the product needs them, such as fonts and test files.

## Examples

Good:

```text
feat(roll-call): mark the whole class present in one tap
fix(documents): shape lam-alef correctly in journal PDFs
perf(engine): generate a term's sessions without reloading the pack
refactor(core): move the average rules into the assessment module
build(deps): update the spreadsheet library to 3.2.1
docs(prd): fix the anchor links in section 5
```

Not like this:

| Message | Problem |
|---|---|
| `Fixed stuff` | No type, and it says nothing |
| `feat: Added the export.` | Past tense, a capital letter, a full stop, and vague |
| `fix(roll-call): fix bug #45` | Says nothing unless you open the issue |
| `feat(sync): new sync + refactor db + bump deps` | Three changes in one commit |
