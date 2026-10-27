# Instructions for coding agents

<!-- djazairdev-template: 1.7.0 -->

This file tells coding agents (Claude Code, Codex, Cursor, Copilot and others) how to work in this repository. People may find it useful too.

## The project

<!-- Two or three sentences: what it does, the main folders, the language and framework. -->

## Commands

```bash
# install the dependencies
# run the tests (what CI runs)
# run the linter and the formatter
# build
```

## Rules

- Run the tests and the linter before you say a change is done, and say if they fail.
- Keep each change small and focused on one thing; match the code around it.
- Add a test when you change behaviour.
- Title pull requests as Conventional Commits (`fix: …`, `feat: …`, `feat!: …` for a breaking change, `docs: …`): the version and the changelog are made from them. Don't edit `CHANGELOG.md` or the version by hand.
- Never commit secrets, tokens, `.env` files or personal data.
- Don't push, merge, publish a release, deploy, or change repository settings unless the maintainer asks. Never open an issue, a pull request or a comment on your own: a person reviews and submits them ([CONTRIBUTING.md](CONTRIBUTING.md#ai-assisted-contributions)).
- Don't change the licence, and don't add dependencies without saying why.

<!-- Add the project's own rules: style, data sources, things never to touch. -->
