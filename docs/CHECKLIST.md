# The djazairdev ready checklist

What a project needs before it joins djazairdev. **Required** items are the seven checks the [djazair.dev Hub](https://github.com/djazairdev/djazair.dev/blob/main/CONTRIBUTING.md#list-a-project-in-the-hub) runs before it lists a project. **Recommended** items are what keeps a project healthy once people start using it and contributing. **Optional** items depend on the project.

Some items are settings only a maintainer can change, marked **(maintainer)**. A coding agent following [ADOPT.md](ADOPT.md) prepares everything else and lists those for you.

## Required

| # | Item | How to meet it | How to check |
|---|---|---|---|
| R1 | An open-source licence | A `LICENSE` file in the root with an OSI-approved licence, unchanged so GitHub recognises it. MIT is our default. A dataset may use an open data licence instead (CC0, CC BY 4.0, CC BY-SA 4.0, ODbL, ODC-By or PDDL), for example code under MIT in `LICENSE` and data under CC0 in `LICENSE-data`. | The repository page shows the licence's name in *About* |
| R2 | Recent activity | At least one commit on the default branch in the last 90 days | The latest commit's date |
| R3 | README and CONTRIBUTING | `README.md` says what the project does, for whom, and how to run it. `CONTRIBUTING.md` says how to set it up, run the tests and send a pull request. Keep both in the repository itself: they describe this project's setup, so the organisation has no default for them. | Both files exist in the root, `docs/` or `.github/` |
| R4 | Labels for newcomers | Issues turned on, with the label `good first issue` or `help wanted` (GitHub adds both to new repositories). No number of open issues is required, but the Hub shows a project's labelled issues to newcomers, so label a few: each with the context a newcomer needs, where to start, when it's done, and a line such as `You'll need: Python, pytest` | *Issues → Labels* |
| R5 | The maintainer pledge | The maintainers reply to newcomers' pull requests within 7 days. Say so in `CONTRIBUTING.md`, and, outside the djazairdev organisation, set `maintainer_pledge: true` when you list the project. | `CONTRIBUTING.md` |
| R6 | The topics **(maintainer)** | Add the topic `djazairdev` under *About → Topics* on the repository page. In the djazairdev organisation, also add one category, `app`, `library`, `tool` or `dataset`, and one to five tags from the [Hub's list](https://github.com/djazairdev/djazair.dev/blob/main/CONTRIBUTING.md#list-a-project-in-the-hub), such as `arabic` or `open-data`: the Hub then lists the project at its next refresh, with no entry in `projects.yml` | The repository page |
| R7 | Relevance to Algeria | Algerian maintainers, or a clear link to Algeria: local data, languages, payments, public services and so on. | A person checks the project and its maintainers |

Run checks R1 to R6 on a repository that's on GitHub with djazair.dev's checker (it needs only Python):

```bash
git clone --depth 1 https://github.com/djazairdev/djazair.dev
cd djazair.dev
python3 -m hub check-project owner/name --pledge
```

## Recommended

| # | Item | How to meet it |
|---|---|---|
| C1 | Code of conduct, security policy and pull request template | Repositories in the djazairdev organisation inherit them from [djazairdev/.github](https://github.com/djazairdev/.github). A project outside it copies `CODE_OF_CONDUCT.md`, `SECURITY.md` and `.github/pull_request_template.md` from there and puts its own contact in them. |
| C2 | CI on every pull request | A workflow that runs the linter, the tests and the build on every pull request and every push to the default branch: start from [`starters/ci/`](../starters/ci/). **(maintainer)** Under *Settings → Actions → General*, approval for fork pull request workflows is *Require approval for first-time contributors*, as CONTRIBUTING says: only a newcomer's first pull request waits. In the djazairdev organisation it's already set. |
| C3 | A protected default branch **(maintainer)** | [`.github/rulesets/main.json`](../.github/rulesets/main.json), imported under *Settings → Rules → Rulesets*: no deleting or force-pushing the default branch, changes through pull requests, every review conversation resolved, and the test jobs must pass. Templates can't carry rulesets, so each repository imports its own ([how](../.github/rulesets/README.md)). |
| C4 | Code scanning and private vulnerability reporting | **In the djazairdev organisation: automatic.** The organisation's security configuration is enforced on every repository, new ones included: CodeQL's default setup, Dependabot alerts and security updates, the dependency graph, secret scanning with push protection, and private vulnerability reporting, which the security policy's *Report a vulnerability* button needs. **Outside it (maintainer):** turn the same on under *Settings → Advanced Security*. A repository transferred into the organisation gets the configuration once an owner applies it. |
| C5 | Dependency updates | `.github/dependabot.yml` for GitHub Actions and the project's package managers |
| C6 | Versions and releases | [semantic versions](https://semver.org) tagged `v1.2.3`, with a GitHub release and a `CHANGELOG.md` entry for each, made by release-please from Conventional Commit pull request titles: [`starters/release-please/`](../starters/release-please/). **(maintainer)** Allow only squash merging, with the pull request's title as the commit message. |
| C7 | Instructions for coding agents, and rules for AI-assisted contributions | `AGENTS.md`: how to build and test the project, and its rules. CONTRIBUTING's *AI-assisted contributions* section: the contributor is the author, says which tool they used, and runs the checks; no agent opens issues or pull requests on its own. |
| C8 | Consistent files | `.editorconfig` and `.gitattributes`, so editors and operating systems agree on line endings and indentation |
| C9 | Issue forms | Repositories in the organisation inherit a bug form and an idea form. A repository that adds a form of its own loses the inherited ones, so it copies those it still wants. A label a form sets must exist in the repository. |
| C10 | No secrets in the repository | Secrets live in GitHub's *Settings → Secrets*, never in files; `.gitignore` covers local environment files such as `.env` |
| C11 | A short README that leads to a first contribution | The shape of [`README.template.md`](../README.template.md): badges for CI, the latest release, open good first issues and open improvements; what the project does and for whom; *Quick start*, with an example, screenshot or demo if there is one; *Make your first contribution*, with the ways to help without code that the project accepts; *Feedback* (questions in Discussions, bugs and improvements in issues, new projects in djazair.dev's Ideas); and the project's licence. Longer docs go in `docs/`. |
| C12 | Governance and code owners | [`GOVERNANCE.md`](../GOVERNANCE.md): the maintainers, how decisions are made, and how a contributor becomes a maintainer. [`.github/CODEOWNERS`](../starters/community/CODEOWNERS) lists the same maintainers, so GitHub asks them to review each pull request. |
| C13 | Taking issues without waiting | [`.github/workflows/take.yml`](../.github/workflows/take.yml): a comment `/take` assigns the issue to its author unless someone already has it, and `/drop` frees it. CONTRIBUTING's *Find something to work on* explains both, and no rule makes contributors wait for a maintainer before they start an issue. |

## Optional

| # | Item | When |
|---|---|---|
| O1 | Deploys from CI | For a site or an API: deploy only from the default branch, after CI passes, behind a repository variable such as `DEPLOY_ENABLED` so deploys can be paused without touching secrets ([`starters/ci/static.yml`](../starters/ci/static.yml)) |
| O2 | An Arabic README | Once a fluent speaker has reviewed it |
| O3 | Discussions **(maintainer)** | Outside the organisation, when questions outgrow issues. Repositories in it send questions to [djazairdev's discussions](https://github.com/orgs/djazairdev/discussions). |
| O4 | An accessibility statement | For a project with a user interface: [`ACCESSIBILITY.md`](../starters/community/ACCESSIBILITY.md), with its promises (keyboard, labels, right-to-left layout), how to report a barrier, and how to check a change in Arabic and at phone width |
| O5 | A wording or translation form | For a project in more than one language: [`wording.yml`](../starters/community/wording.yml), so native speakers report wrong or missing text without writing code |
