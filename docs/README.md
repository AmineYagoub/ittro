# The template's docs

- [ADOPT.md](ADOPT.md): the prompt that makes a repository djazairdev ready with a coding agent.
- [CHECKLIST.md](CHECKLIST.md): what "djazairdev ready" means, item by item. **Required** items are the Hub's seven checks, **Recommended** items keep a project healthy, **Optional** items depend on the project.

## What's here

| File | What it is | In a project |
|---|---|---|
| [`docs/`](.) | These docs | Deleted after use |
| [`README.template.md`](../README.template.md) | A short README: badges, quick start, first contribution, feedback | Becomes `README.md` |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | How to set up, test and send a pull request; review; AI-assisted contributions; the pledge and the licence terms | Kept, filled in |
| [`GOVERNANCE.md`](../GOVERNANCE.md) | The maintainers, how decisions are made, how to become a maintainer | Kept, filled in |
| [`AGENTS.md`](../AGENTS.md) | Instructions for coding agents working in the project | Kept, filled in |
| [`CHANGELOG.md`](../CHANGELOG.md) | Versions, newest first, written by release-please | Kept |
| [`LICENSE`](../LICENSE) | MIT | Kept, with the project's copyright holder |
| [`.editorconfig`](../.editorconfig), [`.gitattributes`](../.gitattributes) | Line endings and indentation | Kept |
| [`.github/dependabot.yml`](../.github/dependabot.yml) | Weekly dependency updates | Kept, with the project's package managers |
| [`.github/rulesets/`](../.github/rulesets/) | The default branch's ruleset, to import | Kept, with the project's test jobs |
| [`starters/ci/`](../starters/ci/) | CI for Python, JavaScript and TypeScript, PHP, Go, Rust, Flutter and Dart, and static sites and datasets with Cloudflare deploys | One becomes `.github/workflows/ci.yml` |
| [`starters/community/`](../starters/community/) | CODEOWNERS, an accessibility statement, and a wording or translation form | CODEOWNERS to `.github/`; the others when needed |
| [`starters/release-please/`](../starters/release-please/) | Semantic versions, tags, GitHub releases and the changelog, from pull request titles | Workflows to `.github/workflows/`, JSON files to the root |
| [`.github/workflows/take.yml`](../.github/workflows/take.yml) | `/take` and `/drop` on issues: contributors assign themselves (C13) | Kept, unchanged |
| [`.github/workflows/template.yml`](../.github/workflows/template.yml) | Checks the template itself | Deleted |

The code of conduct, the security policy, the support page, the pull request template and the issue forms aren't here: every repository in the organisation inherits them from [djazairdev/.github](https://github.com/djazairdev/.github). A project outside the organisation copies them from there.

## Changing the template

Open a pull request. Every starter must pass the [template's CI](../.github/workflows/template.yml), which lints the workflows. When a change matters to projects that already adopted the template, raise the version in `AGENTS.md` and `ADOPT.md` and add a line below, so the next run of `ADOPT.md` picks it up.

## Versions

- **1.7.0** (2026-10-15): contributors take issues themselves. A comment `/take` assigns the issue to its author unless someone already has it, and `/drop` frees it ([`take.yml`](../.github/workflows/take.yml), C13); a maintainer may free an issue with no pull request or update for 7 days. CONTRIBUTING and the README say so, instead of asking contributors to comment and wait. CONTRIBUTING also says that only a first pull request's CI waits for a maintainer's approval, which is the organisation's setting (C2). A project on any earlier version copies `.github/workflows/take.yml`, updates the *Find something to work on* lines, step 2 of *Make your first contribution* and the CI line under *Review*, and removes any rule that makes contributors wait for a maintainer before starting an issue.
- **1.6.0** (2026-10-13): the README no longer says how the project relates to Algeria, no longer lists the languages questions may be asked in, and no longer ends with the djazairdev line; *Propose a new project* drops "for Algeria". R7 is still required, but a person checks it from the project and its maintainers, and it goes in the Hub listing rather than the README. A project on 1.4.0 or later deletes those lines from its README: the sentence on Algeria near the top, *Ask in Arabic, Tamazight, French or English…*, "for Algeria" after *Propose a new project*, and the closing `---` and *Part of djazairdev…* line.
- **1.5.3** (2026-10-11): the release-please starter no longer starts CI and the title check on the release pull request with `workflow_dispatch`. Since 2026-06-11, GitHub holds the runs on a pull request opened with `GITHUB_TOKEN` until someone with write access approves them, and it doesn't count a dispatched run's checks for the pull request, so the release pull request stayed blocked (found on Detent's 3.2.1 release pull request; wilayas' first one passed on runs from a maintainer's push, not on dispatched ones). A maintainer now approves the release pull request's runs before merging it, as the starter's README says. A project on 1.2.0 or later removes the step that runs the checks from `release.yml`, and `actions: write` unless a step of its own still starts a workflow (such as CI on the new tag), and removes the `workflow_dispatch` trigger and the job's `if:` from `pr-title.yml`.
- **1.5.2** (2026-10-10): the ruleset requires every review conversation to be resolved before a merge, as founders.coffee's does. A project that imported `main.json` updates its live ruleset to match (C3).
- **1.5.1** (2026-10-10): the release-please starter starts the checks on the release pull request it just made or updated, reading its branch from release-please's output. It used to look the pull request up by its label, a second after it was made and before GitHub's search could find it, so no checks started (found on wilayas' first release pull request). A project on 1.2.0 or later copies the new step into its `release.yml`.
- **1.5.0** (2026-10-10), from founders.coffee's practices: CONTRIBUTING gains *Review* (fork CI waits for a maintainer, new commits rather than force-pushes, nothing closed automatically), *AI-assisted contributions* (the contributor is the author, names the tool, runs the checks; no autonomous agents) and clearer licence terms (GitHub's terms, D.6). `GOVERNANCE.md` and `CODEOWNERS` (C12). Optional `ACCESSIBILITY.md` (O4) and a wording or translation form (O5). The organisation's pull request template asks how it was tested, for screens in Arabic and French or English, and about AI use, and no longer asks for a hand-written changelog entry.
- **1.4.0** (2026-10-10): the README welcomes questions in Arabic, Tamazight, French or English, as the code of conduct does, with code, docs and issue titles in English. *Suggest an improvement* (the project's issues) and *Propose a new project* (djazair.dev's Ideas) are separate, and the badge counts improvements. The pledge line says a review or a merge may take longer than the 7-day reply. The licence is the project's own, not always MIT. An optional example under *Quick start*, the ways to help without code, and a closing djazairdev line with the Hub.
- **1.3.0** (2026-10-10): a short README that leads to a first contribution: badges (CI, latest release, good first issues, ideas by votes), quick start, *Make your first contribution*, *Feedback* (Discussions, bug and idea forms, the Facebook Page, in English), licence. Long docs go in `docs/`. The template's own docs moved to `docs/`.
- **1.2.0** (2026-10-10): releases with release-please (C6) replace the changelog script: Conventional Commit pull request titles, checked by `pr-title.yml`; squash merges only; the ruleset requires `PR title`. README badges (C11). The optional items are renumbered O1–O3.
- **1.1.0** (2026-10-10): `.github/rulesets/main.json`, the default branch's ruleset, which each repository imports (C3). R4 asks for a beginner label, not 3 open issues (Hub decision D27).
- **1.0.0** (2026-10-09): the first version.
