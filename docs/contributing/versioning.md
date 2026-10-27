# Versions

Minhajna has several parts that change on different schedules. Each has its own version, and this guide says what makes each one change.

| What | Scheme | Example |
|---|---|---|
| [The apps](#the-apps), Android and web | Semantic versioning | `1.5.2` |
| [The server](#the-server) | Semantic versioning, with the API's major version in its path | `1.2.0`, `/v1/` |
| [File formats](#file-formats) | A major and a minor number, written inside each file | `1.2` |
| [The database on the device](#the-database-on-the-device) | Numbered migrations | migration 37 |
| [Reference data](#reference-data) | One release per school year, then quick fixes | `2026.1`, `2026.2` |
| Documents | The Git history. Decision records are numbered | `0014` |

These versions are independent of each other. App 1.6 may still write version 1.2 of the archive format.

## The apps

The apps follow [Semantic Versioning 2.0.0](https://semver.org/), read for an app that teachers use:

| Part | Goes up when | Example |
|---|---|---|
| Major | Something that teachers or other systems rely on stops working: support for an Android version or a browser ends, or the files the app writes move to a new major format version | `2.0.0` |
| Minor | New features, layouts or settings, or additions to a format | `1.6.0` |
| Patch | Fixes only. These are the only releases allowed in a freeze window ([releases.md](releases.md#the-calendar)) | `1.5.3` |

- **One version for both apps.** The Android app and the web app share the core and must give the same results ([PRD §5.2](../prd/PRD.md#52-architecture)), so they share a version.
- **Before the launch, versions start with 0.** The prototype and the pilot use `0.x` builds, and the launch in September 2027 is `1.0.0`.
- **Teachers' data is safe even in 0.x.** Semantic versioning lets anything change before 1.0, except teachers' records: every archive and database made by a pilot build opens in every later release.
- **Pre-releases** go to the public beta group as `1.5.0-beta.1`, `1.5.0-beta.2`, and so on.
- **Android's version code** is worked out from the version, so it only ever goes up:

  ```text
  major × 1,000,000 + minor × 10,000 + patch × 100 + n
  ```

  `n` is the beta's number, from 1 to 98, and 99 for the release itself. So `1.5.0-beta.1` is 1050001, `1.5.0` is 1050099, and `1.5.1` is 1050199. Minor and patch numbers stay below 100.
- **The web app** shows its version and its build checksum, which anyone can compare with the published one ([PRD §6.6](../prd/PRD.md#66-the-web-app)).

## The server

- **Server releases** use semantic versioning too, with their own numbers. Their notes also serve anyone who runs a server, such as an institution, with any change to configuration or data.
- **The API carries its major version in its path,** for example `/v1/`. Within one major version, the API only grows, with new endpoints and optional fields, and every supported app keeps working.
- **A new major version runs alongside the old one.** The old one keeps working for at least 12 months after its replacement ships. It is switched off only during the summer holiday, never during a school year, and the app warns teachers well before.
- **The sync protocol and its encryption are part of the API.** Any change to them is privacy-sensitive ([workflow.md](workflow.md#review)).
- **No maintenance** in the two weeks before a term-end export ([PRD §6.8](../prd/PRD.md#68-non-functional-requirements)).

## File formats

The formats are the Minhajna archive, the progress statement, the handover package, the timetable package, the plan pack, the reference-data release and the insights payload ([PRD §5.9](../prd/PRD.md#59-files-minhajna-reads-and-writes), [§5.11](../prd/PRD.md#511-formats-offered-to-the-state)).

- **Every file states its format and version.**
- **A minor version only adds** content that an older reader can safely leave out. **Anything else needs a major version:** removing or renaming a field, changing what a field means, or changing how the file is signed or encrypted.
- **Older files always open.** Every app reads every earlier version of every format, for good ([PRD §5.9](../prd/PRD.md#59-files-minhajna-reads-and-writes)). The tests keep a sample file of every released version.
- **Newer files:**
  - a file with a newer major version is not opened, and the app asks the teacher to update;
  - a file with a newer minor version is imported, and the app says that some details were left out.
- **The app writes the newest version it knows.**
- **The specification, its examples and its test files change in the same pull request** as the code ([PRD §5.11](../prd/PRD.md#511-formats-offered-to-the-state)).
- **A new major version of a format offered to the state** needs a decision record, because other systems may depend on it.

## The database on the device

- **Every change to how data is stored is a numbered migration,** run once, and only forwards.
- **Every release upgrades from every earlier release,** the pilot's included, because teachers skip updates. The tests upgrade a made-up database from each released version.
- **Migrations never change the history.** The history is only ever added to ([PRD §5.5](../prd/PRD.md#55-history-corrections-and-signatures)). A migration may add to it, or rebuild what is worked out from it.
- **A failed migration loses nothing.** The app keeps a copy of the data from before the migration until the new version has started successfully.
- **No going back.** An app that finds data from a newer version doesn't open it, and asks the teacher to update.

## Reference data

Plan packs, calendars and rules are versioned as [PRD §4.2](../prd/PRD.md#42-plan-packs) sets out:
- pack IDs follow `dz.<level>.<grade>.<subject>[.<stream>].<edition>`, for example `dz.cem.3am.math.igen-2022`;
- there is one release per school year, such as `2026.1`, with quick fixes as `2026.2` and `2026.3`;
- item IDs never change meaning, and a renamed, split or merged item gets a migration entry;
- a class stays on the release it pinned until its teacher moves it;
- every release is signed ([PRD §4.8](../prd/PRD.md#48-getting-packs-and-calendars-to-the-app)).

The data repository's own guide gives the details when it opens.

## Taking something away

- **A feature that teachers use** is announced in the changelog as going away at least one minor release before it goes. It is removed only between school years.
- **Support for an Android version or a browser** ends only in a major release, announced at least six months before.
