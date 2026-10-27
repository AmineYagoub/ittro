# Community starters

Files a project copies when it needs them ([checklist](../../docs/CHECKLIST.md) C12, O4 and O5).

| File | Copy to | For |
|---|---|---|
| [`CODEOWNERS`](CODEOWNERS) | `.github/CODEOWNERS` | Every project (C12): GitHub asks the maintainers listed in [`GOVERNANCE.md`](../../GOVERNANCE.md) to review each pull request. List the same people in both. |
| [`ACCESSIBILITY.md`](ACCESSIBILITY.md) | The root | A project with a user interface (O4): its promises, how to report a barrier, and how to check a change in Arabic and at phone width |
| [`wording.yml`](wording.yml) | `.github/ISSUE_TEMPLATE/` | A project in more than one language (O5): native speakers report wrong or missing text without writing code. It labels issues `translation`: create that label. |

A repository in the djazairdev organisation that adds an issue form of its own stops inheriting the organisation's forms, so copy `bug.yml`, `idea.yml` and `config.yml` from [djazairdev/.github](https://github.com/djazairdev/.github/tree/main/.github/ISSUE_TEMPLATE) with `wording.yml`.
