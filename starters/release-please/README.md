# Versions and releases with release-please

C6 in the [checklist](../../docs/CHECKLIST.md). Every djazairdev project versions its releases the same way: [semantic versions](https://semver.org) tagged `v1.2.3`, worked out by [release-please](https://github.com/googleapis/release-please) from pull request titles. Nobody picks a version number or edits the changelog by hand.

## How it works

1. **Each pull request's title is a [Conventional Commit](https://www.conventionalcommits.org):** a type, an optional scope, and a summary. `pr-title.yml` checks it.

   | Title | Means | Next version |
   |---|---|---|
   | `fix: wrong code for Adrar` | A bug fix | Patch: 1.2.3 → 1.2.4 |
   | `feat: add postal codes` | A new feature | Minor: 1.2.3 → 1.3.0 |
   | `feat!: rename the code field` | A change that breaks users (`!`) | Major: 1.2.3 → 2.0.0 |
   | `docs:`, `test:`, `ci:`, `chore:`, `refactor:`, `build:`, `style:`, `perf:` | Everything else | None on its own (`perf:` is listed under fixes) |

   Before 1.0.0, a breaking change raises the minor version instead (`bump-minor-pre-major`).
2. **Pull requests are squash-merged,** so each one lands on `main` as a single commit named by its title, which is what release-please reads.
3. **On every push to `main`,** `release.yml` keeps one pull request open, *chore(main): release X.Y.Z*, with the next version and the new `CHANGELOG.md` entry. It updates as more changes land.
4. **To release, a maintainer approves the release pull request's checks, then merges it.** release-please opens it with `GITHUB_TOKEN`, as `github-actions[bot]`, and GitHub holds the runs on a bot's pull request until someone with write access approves them: in its merge box, select *Approve workflows to run*. When CI and `PR title` pass, merge it. Merging tags `vX.Y.Z` and publishes the GitHub release, with the changelog entry as its notes. Release when you choose: the release pull request can wait.

Each time release-please updates the release pull request, its new runs wait again, so approve them just before you merge. From the command line, with the pull request's number:

```bash
SHA=$(gh pr view NUMBER --repo OWNER/NAME --json headRefOid --jq .headRefOid)
gh run list --repo OWNER/NAME --commit "$SHA" --status action_required --json databaseId --jq '.[].databaseId' \
  | xargs -I{} gh api --method POST repos/OWNER/NAME/actions/runs/{}/approve
```

Starting CI on the release branch by hand doesn't replace the approval: GitHub doesn't count the checks of a `workflow_dispatch` run for a pull request, so the ruleset still blocks it.

## Set it up

1. Copy `release.yml` and `pr-title.yml` to `.github/workflows/`, and `release-please-config.json` and `.release-please-manifest.json` to the repository's root.
2. Set `release-type` in `release-please-config.json` for the project, so release-please also updates its version file:

   | Project | `release-type` | Updates |
   |---|---|---|
   | Python | `python` | `pyproject.toml`, `setup.py` or `__init__.py` |
   | JavaScript, TypeScript | `node` | `package.json` and its lock file |
   | PHP | `php` | `composer.json` |
   | Go | `go` | Nothing: Go reads versions from tags |
   | Rust | `rust` | `Cargo.toml` and `Cargo.lock` |
   | Flutter, Dart | `dart` | `pubspec.yaml` |
   | Static site, dataset, anything else | `simple` | `version.txt` |

3. Put the latest released version in `.release-please-manifest.json`, or keep `0.0.0` if there is none yet. The first `feat:` then releases 0.1.0. Keep `CHANGELOG.md`'s old entries: release-please adds new ones above them.
4. In the ruleset, add `PR title` to the required checks and allow only squash merges. The template's [`.github/rulesets/main.json`](../../.github/rulesets/main.json) does both.
5. **(maintainer)** In *Settings → General → Pull Requests*: allow only **squash merging**, with the default commit message set to **Pull request title**. Or run:

   ```bash
   gh repo edit OWNER/NAME --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false
   gh api -X PATCH repos/OWNER/NAME -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
   ```

6. **(maintainer)** Check that *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests* is on, so release-please can open its pull request. It is for djazairdev's repositories. It doesn't start that pull request's checks: they still wait for approval.

## Checks without the approval

GitHub starts the runs by itself when the release pull request is opened with a token other than `GITHUB_TOKEN`: a GitHub App's installation token, made in the job with [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token), or a personal access token, given to release-please as `token`. The tags it makes then start workflows too. The starter keeps `GITHUB_TOKEN`, so the repository holds no secret that can write to it; the cost is one click per release.

## Publishing a package

To publish to npm, PyPI, crates.io, pub.dev or Packagist when a release is made, add the steps to the end of `release.yml`'s job, under `if: steps.release.outputs.release_created == 'true'`. A tag made with `GITHUB_TOKEN` starts no workflows, so a separate workflow `on: release` wouldn't run.
