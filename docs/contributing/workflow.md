# Workflow: from an issue to a merged change

This guide is for everyone who changes the project's files through Git. Shoppers never need Git.

- [Where things happen](#where-things-happen)
- [Before you start](#before-you-start)
- [Setting up](#setting-up)
- [Issues](#issues)
- [Branches](#branches)
- [Pull requests](#pull-requests)
- [Review](#review)
- [Merging](#merging)
- [Decision records](#decision-records)
- [Documents](#documents)
- [Becoming a maintainer](#becoming-a-maintainer)
- [Repository settings](#repository-settings)

## Where things happen

| Place | For |
|---|---|
| [Issues](https://github.com/AmineYagoub/ittro/issues) | Bugs, design corrections, translations and agreed tasks |
| Pull requests | Proposed changes |
| [Decision records](../decisions/) | Decisions about a principle, a licence, a data flow, voice behaviour, money or a partnership |

- **Everything here is public, and stays public.** Never post a shopper's picture, audio, or anyone's personal data.
- **Language.** Code, commits and pull requests are in English. Issues may be in Arabic, French or English. A maintainer adds an English summary when developers need one.

## Before you start

- **Small fixes,** such as a typo, a broken link or an obvious bug: open a pull request directly.
- **Anything larger:** open an issue first, or comment on an existing one. Agree the approach with a maintainer before you write the code, so you don't do work that cannot be merged.
- **Decisions come before code.** A change that touches a principle, a licence, a data flow, voice behaviour, money or a partnership needs an accepted decision record first ([Decision records](#decision-records)).
- **Code is welcome from anyone.** Issues labelled `good first issue` and `help wanted` are ready to take.

## Setting up

Fork the repository on GitHub, then:

```sh
git clone https://github.com/<your-account>/ittro.git
cd ittro
git remote add upstream https://github.com/AmineYagoub/ittro.git
git config user.name "The name you use in the project"
git config user.email "you@example.org"
```

The name and email address go into your sign-off ([commits.md](commits.md#sign-off)). A GitHub no-reply address is fine.

## Issues

- **Search first,** including closed issues. Add to an existing issue rather than opening a duplicate.
- **One problem per issue.**
- **Bug reports** give:
  - the app's version, and the phone model with its Android version;
  - the steps to reproduce the bug, with made-up product names;
  - what you expected, and what happened.
- **Feature requests start with the shopper's problem:** who has it, when, and what they do today. Then describe your idea.
- **Security problems never go in an issue.** Report them privately to a maintainer, never in public.

**Labels**

| Label | Meaning |
|---|---|
| `bug`, `feature`, `docs` | The kind of work |
| `translation` | Arabic or French wording |
| `area: <name>` | The part of the product, named as in the commit scopes ([commits.md](commits.md#scopes)) |
| `privacy-sensitive` | Touches a privacy-sensitive area, so it gets extra review ([Review](#review)) |
| `needs-decision` | Waits for a decision record |
| `good first issue` | Small and well described, for a first contribution |
| `help wanted` | Maintainers would welcome help |
| `blocked` | Waits on something outside the project, which the issue names |

**Triage.** Maintainers aim to label each new issue within a week, and ask for anything missing. Issues are closed with a reason. No bot closes issues for inactivity.

## Branches

- **`main` is always releasable.** Every commit on it has passed the checks, and every change reaches it through a pull request.
- **Work branches.**
  - Contributors work on a branch in their own fork. Maintainers may make branches in the main repository.
  - Name a branch after its change, as `<type>/<short-topic>`, using the commit types ([commits.md](commits.md#types)). Add the issue number if there is one. For example: `fix/repeat-no-with-direction` or `feat/123-arabic-clips`.
  - Keep branches short-lived: merge or close them within a few weeks.
- **Keeping up to date.** Rebase your branch on the latest `main`, rather than merging `main` into it:

  ```sh
  git fetch upstream
  git rebase upstream/main
  git push --force-with-lease
  ```

  Once review has started, push follow-up commits instead of rewriting the branch, so reviewers can see what changed. The commits are squashed when the pull request is merged ([Merging](#merging)).
- **Shared history is never rewritten.** Nobody force-pushes to `main`. The one exception is removing a secret or shopper data ([engineering.md](engineering.md#if-something-leaks)).

## Pull requests

**Scope**
- **One change per pull request:** a fix, a feature or a refactor, not a mix.
- **Small.** Aim for under about 400 changed lines, not counting tests, generated files and translations. Split larger work into a series of pull requests, and say in each one where it fits.
- **Keep reformatting and moved code separate** from changes in behaviour, so reviewers can see what really changed.
- **Open a draft pull request early** when you want feedback on the approach.

**The title** becomes the commit subject on `main`, so it follows the commit format ([commits.md](commits.md)). For example: `fix(guide): say the way with every repeated no`.

**The description** covers:
- **what changes and why,** with `Fixes #123` or `Refs #123`;
- **how you tested it:** on which phone, and against Metro or a dev build. For screens, also right to left, with text at 200% and with the screen reader, where relevant;
- **screenshots or recordings,** if any, **with made-up products only;**
- **whether it is privacy-sensitive,** and which of the areas in [Review](#review) it touches;
- **documents:** the design spec, a decision record or a voice script, updated when the change affects them;
- **credit:** how you'd like to be credited in the release notes, or whether you'd rather not be.

**Checks.** These must pass before a merge:
- the TypeScript check, the linter and the tests;
- the sign-off on every commit (DCO);
- the pull request's title, against the commit format;
- the licences of new dependencies.

If a check fails for a reason unrelated to your change, say so in the pull request, and a maintainer will look into it.

## Review

**Who reviews**
- **Every change is reviewed by a maintainer other than its author,** from the day the project has two maintainers. Until then, the lead maintainer reviews every contribution, and merges their own changes once the checks pass.
- **Code owners.** `.github/CODEOWNERS` names the maintainers who review each area, once that file exists.

**Privacy-sensitive changes**

A change is privacy-sensitive if it touches:
- pictures or audio leaving the phone;
- the Meta API key or any credential;
- how long pictures, answers or helper data are kept;
- the microphone or camera lifecycle.

Such a change:
- is labelled `privacy-sensitive`, by its author or a reviewer;
- needs two maintainers' approval;
- carries a plain-words line for the release notes ([releases.md](releases.md#the-changelog)).

While there is only one maintainer, a public notice goes out at least a week before the release that ships the change, instead of the second approval.

**What reviewers check, in this order**
1. **The principles.** Does any picture or audio leave the phone beyond Meta and the chosen helper? Is every spoken number computed, never fixed? Is there any shopper data in the code, the tests or the screenshots? ([engineering.md](engineering.md))
2. **Correctness.** Does it do what it says? Do the tests prove it, edge cases included?
3. **Shoppers.** Voice-first, right to left where relevant, accessible, and fast on a budget phone.
4. **Fit.** Is it readable, and does it follow the code around it?
5. **Everything else:** new dependencies and their licences, documents and the changelog.

**How to review**
- Review the change, not the person. Be specific, and explain why.
- Say which comments must be resolved before the merge. Mark optional ones with `nit:` or `suggestion:`, and questions with `question:`.
- Aim to respond within five working days. If a pull request waits longer, its author may ping the reviewers.
- Approve when the change is good enough to merge, not only when it is how you would have written it.

**How to answer a review**
- Answer every comment, with a change or with a reason.
- Leave a blocking comment for its reviewer to resolve. You may resolve optional ones yourself once you have dealt with them.
- When author and reviewer disagree, another maintainer decides. For anything a decision record would cover, the lead maintainer decides, and records it.

## Merging

- **Squash and merge** is the default. Each pull request becomes one commit on `main`:
  - its subject is the pull request's title;
  - before merging, the maintainer edits its body so that it explains why, and keeps every `Signed-off-by`, `Co-authored-by` and `Fixes` line.
- **Rebase and merge** is used when the author asks for it, and each commit is a separate step that builds, passes the checks and follows the commit format.
- **Merge commits are not used,** so the history of `main` stays a straight line.
- **Who merges:** a maintainer, once the approvals are in and the checks pass. A maintainer may merge their own pull request once it is approved.
- **After the merge,** the branch is deleted and the linked issues close.

**Reverting.** When a change breaks `main`, it is reverted first and fixed afterwards, in a new pull request. The revert explains what broke, and blames nobody.

## Decision records

A decision about a principle, a licence, a data flow, voice behaviour, money or a partnership gets a record in [`docs/decisions/`](../decisions/). The folder starts with the first decision; the format follows the template the maintainers agree when it is needed.

1. **Propose.** Open a pull request titled `docs(decisions): propose 00NN on <subject>`. Link it from the issue.
2. **Discuss.** A proposal stays open for comments for at least 7 days. A change to a principle stays open for at least 30 days.
3. **Decide.** The lead maintainer decides, after hearing contributors. The status becomes `Accepted` or `Rejected`, and the record is merged either way, so the reasons stay public.
4. **Change it later.** An accepted record is not rewritten. A new record replaces it, and the pull request that accepts the new record also sets the old one's status to `Superseded by 00NN`, or `Superseded in part by 00NN` when it replaces only part. Typos and broken links may be fixed at any time.

The pull requests that carry out a decision link to its record.

## Documents

- **Changing a settled design section.** Open a pull request that says what changes and why. A change to a principle follows the decision process above.
- **Writing.** Plain English in short sentences. Cite the DESIGN.md section or decision record that a rule comes from. Anything shoppers need to know is kept short enough to say aloud.
- **What public documents never contain:** shopper pictures or audio, real product lists from a named shop, or anyone's personal data.

## Becoming a maintainer

Maintainers are invited from regular contributors whose changes and reviews show good judgement, above all about the principles. The lead maintainer invites them, and announces each invitation in public ([GOVERNANCE.md](../../GOVERNANCE.md)).

Every maintainer turns on two-factor authentication, and signs the release tags they make.

## Repository settings

These settings enforce the rules above. They are listed here so that anyone can check them.

- **Branch protection** on `main`, for everyone, maintainers included, from the first code:
  - changes only through pull requests;
  - the checks must pass;
  - approval by a maintainer other than the author, from the day there are two maintainers;
  - a straight-line history;
  - no force-push and no deletion.
- **Merging:** squash and rebase only. Branches are deleted after the merge.
- **Security:** secret scanning with push protection, private vulnerability reporting, and alerts for vulnerable dependencies.
- **Sign-off required** for commits made on the GitHub website.
