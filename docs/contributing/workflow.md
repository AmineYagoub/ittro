# Workflow: from an issue to a merged change

This guide is for everyone who changes the project's files through Git: developers, data curators and maintainers. Teachers don't need Git. They contribute as [CONTRIBUTING.md](../../CONTRIBUTING.md) explains.

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
| [Issues](https://github.com/djazairdev/minhajna/issues) | Bugs, plan corrections, templates, translations and agreed tasks |
| Discussions | Questions, and ideas that are not yet a task |
| Pull requests | Proposed changes |
| The private channel in [SECURITY.md](../../SECURITY.md) | Security problems. Never a public issue |
| [Decision records](../decisions/) | Decisions about a principle, a licence, a data flow, the insights layer, money or a partnership |

- **Everything here is public, and stays public.** Never post real pupil data ([CONTRIBUTING.md](../../CONTRIBUTING.md#never-post-real-pupil-data)).
- **Language.** Code, commits, pull requests and developer discussions are in English. Teachers may write issues in Arabic, French or English. A maintainer adds an English summary when developers need one.

## Before you start

- **Small fixes,** such as a typo, a broken link or an obvious bug: open a pull request directly.
- **Anything larger:** open an issue first, or comment on an existing one. Agree the approach with a maintainer before you write the code, so you don't do work that cannot be merged.
- **Decisions come before code.** A change that touches a principle, a licence, a data flow, the insights layer, money or a partnership needs an accepted decision record first ([Decision records](#decision-records)).
- **Take an issue** by commenting `/take` on it: it's assigned to you straight away, unless someone already has it. Comment `/drop` if you stop. If an assigned issue has no activity for 30 days, it can go to someone else.
- **Code is welcome from anyone** ([0021](../decisions/0021-code-contributions-open-to-all.md)). Issues labelled `good first issue` and `help wanted` are ready to take.

## Setting up

Fork the repository on GitHub, then:

```sh
git clone https://github.com/<your-account>/minhajna.git
cd minhajna
git remote add upstream https://github.com/djazairdev/minhajna.git
git config user.name "The name you use in the project"
git config user.email "you@example.org"
```

The name and email address go into your sign-off ([commits.md](commits.md#sign-off)). A GitHub no-reply address is fine.

## Issues

- **Search first,** including closed issues. Add to an existing issue rather than opening a duplicate.
- **One problem per issue.**
- **Bug reports** give:
  - the app's version, and the device or browser;
  - the steps to reproduce the bug, using the demo class or made-up data;
  - what you expected, and what happened.
- **Feature requests start with the teacher's problem:** who has it, when, and what they do today on paper. Then describe your idea.
- **Plan corrections and templates** give their source, and the level, subject and school year they apply to ([CONTRIBUTING.md](../../CONTRIBUTING.md#content-contributions)).
- **Security problems never go in an issue** ([SECURITY.md](../../SECURITY.md)).

**Labels**

| Label | Meaning |
|---|---|
| `bug`, `feature`, `docs` | The kind of work |
| `plan-correction`, `template`, `translation` | Content contributions |
| `area: <name>` | The part of the product, named as in the commit scopes ([commits.md](commits.md#scopes)) |
| `privacy-sensitive` | Touches a privacy-sensitive area, so it gets extra review ([Review](#review)) |
| `needs-decision` | Waits for a decision record |
| `good first issue` | Small and well described, for a first contribution |
| `help wanted` | Maintainers would welcome help |
| `blocked` | Waits on something outside the project, which the issue names |

**Triage.** Maintainers aim to label each new issue within a week, and ask for anything missing. Issues are closed with a reason. No bot closes issues for inactivity.

## Branches

- **`main` is always releasable.** Every commit on it has passed the checks, and every change reaches it through a pull request.
  - Until the first code lands, the lead maintainer may still commit documents directly to `main`.
- **Release branches,** named `release/<major>.<minor>` (for example `release/1.5`), are made when a release is prepared. They receive only fixes ([releases.md](releases.md#branches-and-tags)).
- **Work branches.**
  - Contributors work on a branch in their own fork. Maintainers may make branches in the main repository.
  - Name a branch after its change, as `<type>/<short-topic>`, using the commit types ([commits.md](commits.md#types)). Add the issue number if there is one. For example: `fix/workbook-locked-cells` or `feat/123-one-tap-roll-call`.
  - Keep branches short-lived: merge or close them within a few weeks.
- **Keeping up to date.** Rebase your branch on the latest `main`, rather than merging `main` into it:

  ```sh
  git fetch upstream
  git rebase upstream/main
  git push --force-with-lease
  ```

  Once review has started, push follow-up commits instead of rewriting the branch, so reviewers can see what changed. The commits are squashed when the pull request is merged ([Merging](#merging)).
- **Shared history is never rewritten.** Nobody force-pushes to `main` or a release branch. The one exception is removing pupil data or a secret ([engineering.md](engineering.md#if-something-leaks)).

## Pull requests

**Scope**
- **One change per pull request:** a fix, a feature or a refactor, not a mix.
- **Small.** Aim for under about 400 changed lines, not counting tests, generated files and translations. Split larger work into a series of pull requests, and say in each one where it fits.
- **Keep reformatting and moved code separate** from changes in behaviour, so reviewers can see what really changed.
- **Open a draft pull request early** when you want feedback on the approach.

**The title** becomes the commit subject on `main`, so it follows the commit format ([commits.md](commits.md)). For example: `fix(export): leave locked cells untouched in the grade workbook`.

**The description** covers:
- **what changes and why,** with `Fixes #123` or `Refs #123`;
- **how you tested it:** on which devices and browsers. For screens, also right to left, with text at 200% and with the screen reader, where relevant;
- **screenshots or recordings,** if any, **from the demo class or made-up data only;**
- **whether it is privacy-sensitive,** and which of the areas in [Review](#review) it touches;
- **`NETWORK.md`,** updated in the same pull request if a network call is added or changed;
- **the changelog:** a fragment in `changelog.d/`, or "no change teachers can see" ([releases.md](releases.md#changelog-fragments));
- **documents:** format specifications, test files, the PRD or a decision record, updated when the change affects them;
- **credit:** how you'd like to be credited in the release notes, or whether you'd rather not be.

**Checks.** These must pass before a merge:
- the build, the type checks, the linter and the tests;
- the sign-off on every commit (DCO);
- the licence of every file (REUSE);
- the pull request's title, against the commit format;
- secret scanning;
- the licences and known vulnerabilities of dependencies.

If a check fails for a reason unrelated to your change, say so in the pull request, and a maintainer will look into it.

## Review

**Who reviews**
- **Every change is reviewed by a maintainer other than its author,** from the day the project has two maintainers ([PRD §1.7](../prd/PRD.md#17-contributions)). Until then, the lead maintainer reviews every contribution, and merges their own changes once the checks pass.
- **Code owners.** `.github/CODEOWNERS` names the maintainers who review each area.
- **Reference data** is reviewed by a data curator and a subject maintainer, against the source pages ([PRD §4.3](../prd/PRD.md#43-the-pack-pipeline)).

**Privacy-sensitive changes**

A change is privacy-sensitive if it touches:
- network calls;
- encryption;
- sync;
- insights;
- the export of marks;
- anything that reads or writes the school's official files.

Such a change:
- is labelled `privacy-sensitive`, by its author, a reviewer or the automatic labeller;
- needs two maintainers' approval;
- carries a plain-Arabic line for the release notes ([releases.md](releases.md#the-changelog)).

While there is only one maintainer, a public notice goes out at least a week before the release that ships the change, instead of the second approval ([PRD §1.7](../prd/PRD.md#17-contributions)).

**What reviewers check, in this order**
1. **The principles.** Does anything new leave the device? Is each record's layer respected? Are dates stored without clock times? Is there any real pupil data in the code, the tests or the screenshots? ([engineering.md](engineering.md))
2. **Correctness.** Does it do what it says? Do the tests prove it, edge cases included?
3. **Teachers.** Arabic first and right to left, offline, accessible, and fast on a budget phone ([PRD §6.8](../prd/PRD.md#68-non-functional-requirements)).
4. **Fit.** Is it readable, and does it follow the code around it?
5. **Everything else:** new dependencies and their licences, documents, `NETWORK.md` and the changelog.

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

**Reverting.** When a change breaks `main` or a release being prepared, it is reverted first and fixed afterwards, in a new pull request. The revert explains what broke, and blames nobody.

## Decision records

A decision about a principle, a licence, a data flow, the insights layer, money or a partnership gets a record in [`docs/decisions/`](../decisions/) ([PRD §1.8](../prd/PRD.md#18-governance-and-decisions)).

1. **Propose.** Copy [the template](../decisions/template.md), give it the next number and the status `Proposed`, and open a pull request titled `docs(decisions): propose 00NN on <subject>`. Link it from the issue.
2. **Discuss.** A proposal stays open for comments for at least 7 days. A change to a principle stays open for at least 30 days ([PRD §1.2](../prd/PRD.md#12-principles)). Teachers hear about it where they are: an Arabic summary goes on the website and in the teachers' Facebook group, with the website's form for comments, and the field-check teachers are asked directly. Comments made there count like those on the pull request, and each gets an answer in the record ([PRD §1.8](../prd/PRD.md#18-governance-and-decisions)).
3. **Decide.** The lead maintainer decides, after hearing contributors and, from the launch, the teacher council ([GOVERNANCE.md](../../GOVERNANCE.md)). After adoption, a change to a principle or the charter also needs the teacher council's consent ([0016](../decisions/0016-non-commercial.md)). The status becomes `Accepted` or `Rejected`, and the record is merged either way, so the reasons stay public.
4. **Change it later.** An accepted record is not rewritten. A new record replaces it, and the pull request that accepts the new record also sets the old one's status to `Superseded by 00NN`, or `Superseded in part by 00NN` when it replaces only part, in the record and in the index. Typos and broken links may be fixed at any time.

The pull requests that carry out a decision link to its record.

## Documents

- **Changing a settled section of the PRD.** Open a pull request that says what changes and why. The section's decisions table records the change and its date. A change to a principle follows [PRD §1.2](../prd/PRD.md#12-principles).
- **Specifications,** such as the file formats, change as [versioning.md](versioning.md#file-formats) explains.
- **Writing.** Plain English in short sentences, with British spelling ("licence", "organisation"). Cite the PRD section or decision record that a rule comes from. Anything teachers need to know is summarised in Arabic in the README.
- **What public documents never contain:** real pupil data, quotes from teachers in the research, or the names of competing teacher apps and their developers ([PRD §1.4](../prd/PRD.md#14-what-is-open-and-what-stays-private)).

## Becoming a maintainer

Maintainers are invited from regular contributors whose changes and reviews show good judgement, above all about the principles. The lead maintainer invites them, and announces each invitation in public ([GOVERNANCE.md](../../GOVERNANCE.md)).

Every maintainer turns on two-factor authentication ([PRD §1.8](../prd/PRD.md#18-governance-and-decisions)), and signs the release tags they make.

## Repository settings

These settings enforce the rules above. They are listed here so that anyone can check them.

- **Branch protection** on `main` and `release/*`, for everyone, maintainers included, from the first code:
  - changes only through pull requests;
  - the checks must pass;
  - approval by a maintainer other than the author, from the day there are two maintainers;
  - a straight-line history;
  - no force-push and no deletion.
- **Merging:** squash and rebase only. Branches are deleted after the merge.
- **Security:** secret scanning with push protection, private vulnerability reporting, and alerts for vulnerable dependencies.
- **Reported content:** reports to the maintainers accepted from all users, so conduct problems can be reported privately ([CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)).
- **Sign-off required** for commits made on the GitHub website.
- **Two-factor authentication** required for every member of the organisation.
