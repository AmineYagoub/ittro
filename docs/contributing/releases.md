# Releases and the changelog

This guide is mostly for maintainers. Contributors need only [the changelog fragments](#changelog-fragments).

- [Versions](#versions)
- [Branches and tags](#branches-and-tags)
- [Who releases](#who-releases)
- [The release checklist](#the-release-checklist)
- [Signing](#signing)
- [Fixes and security releases](#fixes-and-security-releases)
- [The changelog](#the-changelog)

## Versions

The app and the relay version independently with [Semantic Versioning 2.0.0](https://semver.org/). During the hackathon both stay `0.x`; the first public release is `1.0.0`.

- **The app** (`app/app.json`): minor for new shopper abilities, patch for fixes.
- **The relay** (`relay/package.json`): minor for new endpoints or fields, patch for fixes. Within one major version the API only grows, so every supported app keeps working.
- **Android's version code** is worked out from the app version, so it only ever goes up:

  ```text
  major × 1,000,000 + minor × 10,000 + patch × 100 + n
  ```

  `n` is the beta's number, from 1 to 98, and 99 for the release itself. Minor and patch numbers stay below 100.
- **Taking something away.** A voice command, an earbud meaning, or a relay field that shoppers or helpers rely on is announced in the changelog as going away at least one minor release before it goes.

## Branches and tags

- **Release branches.** When a release is prepared, a branch `release/<major>.<minor>` is made from `main`. From then on it receives only fixes:
  1. the fix is merged into `main` first, through a pull request;
  2. a maintainer copies it to the release branch with `git cherry-pick -x`, which records where it came from.
- **Patch releases** come from the release branch.
- **Tags** are annotated and signed by the release manager:
  - `app-v1.5.0` and `app-v1.5.0-beta.1` for the app;
  - `relay-v1.2.0` for the relay.
- **A pushed tag is never moved or deleted.** A mistake gets a new version.

## Who releases

- **Each release has a release manager,** a maintainer named in a public release issue.
- **The release issue holds the checklist below,** ticked as the work is done.

## The release checklist

**Before the first beta**
1. Each privacy-sensitive change has two maintainers' approval and its plain-words line. While there is only one maintainer, its public notice goes out at least a week before the release.
2. The changelog fragments are complete.

**Checks on the release commit**

3. Dependencies: every licence is on the allowed list ([engineering.md](engineering.md#dependencies)), and no known vulnerability is left unexplained.
4. Secret scanning is clean.
5. The build is reproducible from the tag.
6. The tests pass: the relay gate tests, the app type check and lint.
7. Changed screens are checked right to left, with text at 200% and with the screen reader. The speed targets hold on a budget phone.

**Beta**

8. The beta goes to test phones for at least a few days. Anything serious it finds is fixed, and a new beta follows.

**Release**

9. The release manager signs the tag. The release is built from the tag and signed, and the SHA-256 checksum of each file is published with it.
10. The release is published on GitHub, with the notes, the files, the checksums and the signatures.
11. It is announced in the project's channel, in plain words.

**After the release**

12. For the first week, maintainers watch the problem reports, and halt the rollout if something serious appears.

## Signing

- **Official builds are made only from the public source.**
- **Signing keys are held by named maintainers,** with an offline backup. They never enter a repository, and no check that runs on a pull request can reach them.
- **A lost or exposed key is a security incident:** tell a maintainer privately at once.

## Fixes and security releases

- **A fix between releases** takes the same path: a pull request into `main`, a cherry-pick to the release branch, then a patch release. The beta may be shortened, but the checks never are.
- **A security fix** is prepared in private. It ships in a release, then the fix is published, crediting the reporter. Critical flaws are fixed within 7 days.

## The changelog

`CHANGELOG.md` holds the release notes, in plain words without jargon.

- **Newest first.** Each release has its version and date, then its sections.
- **Credit.** Each release thanks its contributors. Only those who agreed are listed, under the names they chose.
- **Changes only developers notice,** such as refactors and new checks, stay out of `CHANGELOG.md`. The GitHub release lists every merged pull request.

Each release has these sections, in this order, each only when it has entries.

| Section | For |
|---|---|
| New | New features |
| Changed | Changes to existing features |
| Going away | Features to be removed in a later release ([Versions](#versions)) |
| Removed | Features removed |
| Fixed | Bug fixes |
| Privacy | Every privacy-sensitive change, in plain words |
| Security | Security fixes |

### Changelog fragments

A pull request that changes something shoppers can hear or see adds one file to `changelog.d/`, named after the change. For example, `changelog.d/repeat-no-with-direction.md`:

```markdown
---
section: fixed
credit: <your name>
---
- en: A repeated "no" now says the way again every time.
- ar: <the same sentence, in Arabic>
- fr: <the same sentence, in French>
```

- **`section`** is one of `new`, `changed`, `going-away`, `removed`, `fixed`, `privacy` or `security`.
- **`credit`** is the name to thank. Leave it out if you'd rather not be listed.
- **If you can't write the Arabic or French line,** leave it out, and a maintainer adds it before the release.
- **At release time,** the release manager gathers the lines into `CHANGELOG.md`, then deletes the fragments.

Fragments avoid conflicts in `CHANGELOG.md` when many pull requests are open at once.
