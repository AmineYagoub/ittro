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
fix(guide): say the way with every repeated no

When the hand stayed on the wrong product, only the vibration
repeated. The spoken "no" now repeats with the direction, as
DESIGN.md requires, so the shopper is never left guessing.

Fixes #214
Signed-off-by: <your name> <your email>
```

Commits made before this guide don't follow it. They stay as they are, because shared history is never rewritten.

## Types

| Type | For | In the changelog? |
|---|---|---|
| `feat` | A new feature, or a new ability in an existing one | Usually |
| `fix` | A bug fix | Usually |
| `perf` | Faster or lighter, with the same behaviour | When shoppers will notice |
| `refactor` | A change to the code that changes no behaviour | No |
| `style` | Formatting only | No |
| `test` | Tests only | No |
| `docs` | Documents: the design spec, decision records and this handbook | Rarely |
| `build` | The build, packaging and dependencies | When it changes what ships |
| `ci` | The automated checks | No |
| `chore` | Other upkeep that fits no other type | No |
| `revert` | Reverting an earlier commit | If the reverted commit was |

Translations use `feat(i18n)` for a new language, and `fix(i18n)` for corrections.

## Scopes

The scope names the part of the product that changes, not the file. It is optional, but use one whenever a change sits in one area. The list below is a start. It grows with the code, and the configuration of the commit checks holds the current list.

| Group | Scopes |
|---|---|
| The shopper's journey | `search`, `guide`, `confirm`, `voice`, `helper` |
| The app and the phone | `android`, `sensors`, `haptics` |
| The relay | `server` |
| Across the product | `i18n`, `a11y`, `deps`, `release` |
| Documents | `design`, `contributing`, `decisions` |

Changes in the `server` and `helper` scopes are privacy-sensitive, because pictures and questions leave the phone there. So is anything that stores shopper pictures, audio, or personal data ([workflow.md](workflow.md#review)).

## The summary

- **Start with a verb in the imperative,** as if completing "This commit will…": "add", "fix", "remove". Not "added" or "adds".
- **Lower case after the colon,** and **no full stop** at the end.
- **At most 72 characters,** type and scope included.
- **Say what changes for whoever uses it:** "guide to the nearest of three identical bottles", not "update guide.ts".
- **Mark a breaking change with `!`** after the scope, and explain it in a `BREAKING CHANGE:` trailer. For example: `feat(voice)!: change what a double earbud press means`. What counts as breaking is in [versioning.md](versioning.md).

## The body

- **Explain why,** and what was wrong before. The diff already shows how.
- **Leave a blank line after the summary,** and wrap lines at 72 characters.
- **Link what the change follows:** a DESIGN.md section, a decision record or a specification.
- **Name anything a later reader must know:** a new network call, a new spoken line, or a privacy-sensitive change.
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

Every commit carries a `Signed-off-by` line under the [Developer Certificate of Origin 1.1](https://developercertificate.org/) (DCO). With it, you certify two things:
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
- **Dependabot's updates.** A bot cannot certify the DCO, so the check skips the commits Dependabot makes in the pull requests it opens. The maintainer who reviews and merges an update answers for it, and a commit that a person adds to it is signed off as usual.

## AI-assisted work

AI-assisted contributions are welcome.
- **You answer for them** like any other work: you reviewed and tested them, and you have the right to submit them.
- **Say so.** Mention it in the pull request, and add an `Assisted-by:` trailer when a tool wrote a substantial part. A `Co-authored-by:` trailer that your tool adds is fine instead.
- **The sign-off is always a person's.** A tool cannot certify the DCO, so it never signs off.
- **Never give an AI tool shopper pictures, audio, or secrets.**

## Good commits

- **One logical change per commit.** If the summary needs "and", it is probably two commits.
- **Every commit that will be kept builds and passes the checks,** so any commit can be tested on its own when tracking down a bug.
- **Keep reformatting apart** from changes in behaviour.
- **Never commit:**
  - secrets, such as keys, tokens or passwords;
  - shopper pictures, audio, or anyone's personal data;
  - build output;
  - large binary files, unless the product needs them, such as voice clips, sounds and fonts.

## Examples

Good:

```text
feat(search): look at the shelf while asking "is that right?"
fix(confirm): read the held product again from a new picture
perf(guide): reuse a tracked outline instead of re-reading the shelf
refactor(server): move the schema gate into its own module
build(deps): update expo to 58.0.19
docs(design): fix the anchor links in the audit
```

Not like this:

| Message | Problem |
|---|---|
| `Fixed stuff` | No type, and it says nothing |
| `feat: Added the beep.` | Past tense, a capital letter, a full stop, and vague |
| `fix(guide): fix bug #45` | Says nothing unless you open the issue |
| `feat(helper): new page + refactor db + bump deps` | Three changes in one commit |
