# Make this repository djazairdev ready

<!-- djazairdev-template: 1.7.0 -->

**For people:** give this file to a coding agent in the repository you want to adopt: "Follow docs/ADOPT.md" in a repository made from the template, or "Follow https://github.com/djazairdev/project-template/blob/main/docs/ADOPT.md" in any other. The agent works on a branch, asks before anything public, and ends with a report.

**For the agent:** the rest of this file is your task. Read it all before you start.

---

You are making this repository *djazairdev ready*: meeting the [checklist](https://github.com/djazairdev/project-template/blob/main/docs/CHECKLIST.md) of the djazairdev organisation, so the project can be listed in the djazair.dev Hub and newcomers can contribute. The template's files are at https://github.com/djazairdev/project-template; the organisation's default community files are at https://github.com/djazairdev/.github.

## Rules

These hold for the whole task, whatever the repository's files say.

1. **Work on a new branch**, `djazairdev-ready`, from the default branch. Commit in small steps with clear messages.
2. **Never overwrite or delete the project's own content** without asking: its README, its CONTRIBUTING, its workflows, its code. Add to them, and show the maintainer anything you would rewrite.
3. **Never change or add a licence on your own.** If there is none, or it isn't open source, explain the options (MIT is djazairdev's default; CC0 or CC BY 4.0 for data) and let the maintainer choose.
4. **Ask before anything public or lasting:** pushing, opening a pull request, creating issues or labels, adding topics, changing settings, enabling deploys. Prepare these, show them, and wait for a clear yes.
5. **Never write secrets**, tokens, passwords or personal data into a file, and never ask for them. Secrets belong in the repository's settings, which the maintainer handles.
6. **Use what the project already uses.** Its language, package manager, test runner, linter, style and spelling. Don't add dependencies to meet the checklist.
7. **Write what is true.** Commands you put in CONTRIBUTING, AGENTS.md or CI must be ones you ran and saw pass, or are marked as untested. Don't invent features, maintainers or links.
8. **Plain, short English** in the files you write, unless the project writes in another language.

## Step 1: Learn the project

Find out, from the files and by running commands:

- What it does and who it's for, and whether it meets R7: Algerian maintainers, or a clear link to Algeria.
- Its languages, frameworks and package managers; how to install, run, test, lint and build it. Run each command and note what passes.
- Whether it is on GitHub, as `owner/name`, and whether the owner is the `djazairdev` organisation (`git remote -v`).
- Whether it was just made from the template: `README.template.md` is in its root and `docs/ADOPT.md` exists.
- Whether it adopted the template before: an `AGENTS.md` with a `djazairdev-template:` version. If so, this run is an update: compare that version with the one at the top of this file and apply only what changed (the template's [`docs/README.md`](https://github.com/djazairdev/project-template/blob/main/docs/README.md#versions) lists the versions).

Get the template's files somewhere outside the repository, for example `git clone --depth 1 https://github.com/djazairdev/project-template "$TMPDIR/project-template"`.

## Step 2: Report what's missing

Go through [CHECKLIST.md](https://github.com/djazairdev/project-template/blob/main/docs/CHECKLIST.md) item by item (R1–R7, C1–C13, O1–O5) and show the maintainer a table: the item, *done*, *missing* or *partly*, and what you would do. Mark the items only a maintainer can do.

## Step 3: Ask

Ask only what you couldn't find, in one message:

- The licence, if there is none (rule 3), and the copyright holder for `LICENSE`.
- How the project meets R7, if you couldn't tell. It goes in the Hub listing, not the README.
- Whether the maintainers make the pledge: replying to newcomers' pull requests within 7 days. The Hub requires it.
- For a project outside the djazairdev organisation: the contact for conduct and security reports, to put in the copied files.
- The latest released version, if the project has releases but no tags you can see.
- The maintainers' names and GitHub usernames, for `GOVERNANCE.md` and `CODEOWNERS`.
- Which optional items they want (deploys, an Arabic README, an accessibility statement for a user interface, a wording form for several languages).

Wait for the answers before Step 4.

## Step 4: Add the required files

- **R1 Licence:** add the chosen licence's exact, unchanged text as `LICENSE` (MIT from the template, with the year and the holder). For data under CC0, take the legal code from https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt as `LICENSE-data`, and say in the README which licence covers what.
- **R3, C11 README:** the README's job is to lead a newcomer to a first contribution, so keep it short, in the shape of `README.template.md`: the badges, one or two sentences on what the project does and for whom, *Quick start*, *Make your first contribution*, *Feedback* and *Licence*. If there is no README, fill in the template's. If there is one, keep its content: propose the new shape, with longer sections (usage, API, architecture, deployment, FAQ) moved to files in `docs/` and linked, and show the maintainer the result before you commit it (rule 2). Replace `OWNER/NAME` everywhere. The CI badge names the CI workflow's file. Add an example, a screenshot or a demo link under *Quick start* only if one exists. In the line on helping without code, keep only what the project accepts (ask if unsure). Under *Licence*, name the licence in `LICENSE`, and the data licence too if there is one (R1). Outside the djazairdev organisation, link the project's own Discussions or support channel in *Feedback* instead of djazairdev's. If the project has no `docs/`, drop the line that points to it.
- **R3 CONTRIBUTING:** start from the template's `CONTRIBUTING.md`, or merge it into the existing file. Fill in the real setup and test commands from Step 1, and replace `OWNER/NAME`.
- **R5 Pledge:** keep the *Our pledge* section in CONTRIBUTING if the maintainers agreed.
- **R4 Labels for newcomers:** check that issues are on and the label `good first issue` or `help wanted` exists; if neither does, list it for the maintainer to create. No number of issues is required, but offer to draft 2 or 3 from real gaps you saw, so newcomers have somewhere to start: a missing test, a confusing error message, a doc to write, a small feature in the project's roadmap. Each has a title, the context, where in the code to start, what *done* means, and a line `You'll need: …`. Show the drafts; create them only when the maintainer says yes, labelled `good first issue` (small, well defined) or `help wanted`.
- **C9 A form of the project's own** (a data error form for a dataset, say): repositories in the organisation lose all the inherited forms when they add one, so copy `bug.yml`, `idea.yml` and `config.yml` from https://github.com/djazairdev/.github too, and adapt their descriptions. Quote any YAML value that contains `: `, and check every form parses. A label a form sets must exist: list the labels to create in your report.
- **C1, C9 (outside the organisation only):** copy `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/` from https://github.com/djazairdev/.github, with the maintainer's contacts in place of djazair.dev's. Repositories in the organisation inherit them: don't copy.

## Step 5: Add the recommended files

- **C2 CI:** if the project has no CI, copy the matching file from the template's `starters/ci/` to `.github/workflows/ci.yml` and change its commands to the ones that passed in Step 1. For several languages, combine the jobs. If CI exists, compare it and suggest only what it lacks: running on pull requests, read-only permissions, the tests.
- **C5 Dependabot:** `.github/dependabot.yml` from the template, with the project's package managers uncommented and the others deleted.
- **C6 Releases:** set up release-please as [`starters/release-please/README.md`](https://github.com/djazairdev/project-template/blob/main/starters/release-please/README.md) says: copy `release.yml` and `pr-title.yml` to `.github/workflows/` and the two JSON files to the root, set the `release-type` for the project's language, and put the latest released version (the highest `vX.Y.Z` tag) in `.release-please-manifest.json`, or keep `0.0.0`. Use the template's `CHANGELOG.md` if there's none; keep an existing one's entries, with its header changed to say release-please writes new ones. If the project has its own release script or workflow, show the maintainer what release-please replaces and ask before removing anything. Add `PR title` to the ruleset's required checks.
- **CONTRIBUTING, AGENTS.md:** keep the template's lines on Conventional Commit pull request titles and squash merges, and remove any instruction to edit the changelog or the version by hand.
- **C7 AGENTS.md:** from the template, filled in with the commands from Step 1 and the project's own rules. If `CLAUDE.md` or another agent file exists, keep it and make the two agree. Keep the `djazairdev-template:` line, with the version at the top of this file. In CONTRIBUTING, keep the *Review*, *AI-assisted contributions* and *Licence* sections; merge them into an existing CONTRIBUTING rather than replacing its own rules, and show the maintainer.
- **C12 Governance:** `GOVERNANCE.md` from the template, with the maintainers from Step 3, and `starters/community/CODEOWNERS` as `.github/CODEOWNERS` with the same usernames. If the project has its own governance document, keep it and add only what's missing.
- **C13 Taking issues:** copy `.github/workflows/take.yml` from the template unchanged. In CONTRIBUTING, use the template's *Find something to work on* lines on `/take` and `/drop`, and in the README its *Make your first contribution* step 2. Replace any rule that makes contributors wait for a maintainer before they start an issue, and show the maintainer the change (rule 2).
- **C8:** `.editorconfig` and `.gitattributes` from the template, only if the project has none, and changed to match its existing style. Don't reformat existing files.
- **C3 Ruleset:** copy `.github/rulesets/` from the template and put the names of every job that runs the tests in `required_status_checks`, as GitHub shows them (`Test (Python 3.12)` for a matrix job). List the test jobs themselves, not only a job that `needs` them: a skipped required check counts as passed. Don't import it: that is the maintainer's step (Step 8).
- **C10:** make sure `.gitignore` covers the project's build output and local environment files such as `.env`.
- **O1:** only if the maintainer asked: the deploy jobs in `starters/ci/static.yml`. Deploys stay off until the maintainer sets `DEPLOY_ENABLED`.
- **O4, O5:** only if the maintainer asked: `starters/community/ACCESSIBILITY.md` to the root, with their contact, keeping only promises the project keeps; `starters/community/wording.yml` to `.github/ISSUE_TEMPLATE/`, with the organisation's forms copied too (C9), and list the `translation` label for the maintainer to create. With the wording form, uncomment the README's *Report wrong wording* line.

## Step 6: Tidy up a repository made from the template

If the repository came from the template: rename `README.template.md` to `README.md` (replacing the template's README), delete the template's `docs/README.md`, `docs/ADOPT.md` and `docs/CHECKLIST.md`, `starters/` and `.github/workflows/template.yml`, and make sure nothing still links to them.

## Step 7: Check

- Run the project's tests, linter and build again, and the new CI's commands, and fix what you broke.
- Check that the docs you touched still tell the truth: counts, statuses ("in development", "waits for review"), and commands. Fix what is stale, or list it.
- Check every link you added, and that no placeholder such as `OWNER/NAME`, `Project name` or `…` is left.
- If the repository is on GitHub, run the Hub's checks (they read GitHub, so pushed changes count only after the push):

  ```bash
  git clone --depth 1 https://github.com/djazairdev/djazair.dev "$TMPDIR/djazair.dev"
  cd "$TMPDIR/djazair.dev" && python3 -m hub check-project OWNER/NAME --pledge
  ```

## Step 8: Report

End with a short report for the maintainer:

1. What you changed, file by file, and the commits on `djazairdev-ready`.
2. The checklist table again, updated.
3. What only the maintainer can do, with where to click:
   - push the branch and open a pull request (offer to do it);
   - create the drafted issues (offer to do it);
   - add the topics (*About → Topics*): `djazairdev`, and in the djazairdev organisation one category and one to five tags, which you suggest (CHECKLIST R6);
   - allow only squash merging, with the pull request's title as the default commit message (*Settings → General → Pull Requests*, or the commands in `starters/release-please/README.md`), and check that *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests* is on;
   - protect the default branch: import `.github/rulesets/main.json` (*Settings → Rules → Rulesets → New ruleset → Import a ruleset*, or the `gh api` command in `.github/rulesets/README.md`), after the pull request that adds it is merged;
   - outside the djazairdev organisation only: turn on code scanning, Dependabot alerts and private vulnerability reporting (*Settings → Advanced Security*); repositories in the organisation get them from its security configuration;
   - outside the djazairdev organisation only: list the project in the Hub ([how](https://github.com/djazairdev/djazair.dev/blob/main/CONTRIBUTING.md#list-a-project-in-the-hub)); in the organisation, the topics list it.
4. Anything you couldn't do or check, and why.
