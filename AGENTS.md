# Instructions for coding agents

<!-- djazairdev-template: 1.7.0 -->

This file tells coding agents (Claude Code, Codex, Cursor, Copilot and others) how to work in this repository. People may find it useful too.

## The project

Ittro is an Android shopping companion for blind and low-vision shoppers, speaking Arabic, French or English. It finds a product on the shelf, guides the hand by voice and vibration, and confirms before saying yes.

Folders: `app/` (Expo + React Native), `relay/` (Cloudflare Worker calling Meta), `modules/ittro-sensors/` (local Kotlin module skeleton). Everything is TypeScript; there is no CI yet.

## Commands

```bash
cd app && npm install        # install the app dependencies
cd app && npx tsc --noEmit   # typecheck the app
cd app && npm run lint       # lint the app (TypeScript and JavaScript)
cd relay && npm test         # run the relay tests (node --test)
cd relay && npm run lint     # lint the relay
cd modules/ittro-sensors && npm run lint  # lint the sensor shim
cd app/android && ./gradlew assembleDebug -x lint  # build the debug APK
```

No formatter is configured yet, so none runs here.

## Rules

- Run the tests and the linter before you say a change is done, and say if they fail.
- Keep each change small and focused on one thing; match the code around it.
- Add a test when you change behaviour.
- Title pull requests as Conventional Commits (`fix: …`, `feat: …`, `feat!: …` for a breaking change, `docs: …`): the version and the changelog are made from them. Don't edit `CHANGELOG.md` or the version by hand.
- Never commit secrets, tokens, `.env` files or personal data.
- Don't push, merge, publish a release, deploy, or change repository settings unless the maintainer asks. Never open an issue, a pull request or a comment on your own: a person reviews and submits them ([CONTRIBUTING.md](CONTRIBUTING.md#ai-assisted-contributions)).
- Don't change the licence, and don't add dependencies without saying why.
- **At most 300 lines in any file,** blank lines and comments included. ESLint checks TypeScript and JavaScript; keep every other file to the same limit. Split a file that grows past it by what it does ([engineering.md](docs/contributing/engineering.md#code-style)).
- **Comments at the head only:** a file header and doc comments on exports. None inside a function's body (tool directives and a comment heading a test in a `describe` block aside), none at the end of a line of code (a pinned action's version comment aside), no commented-out code and no TODO: open an issue instead ([engineering.md](docs/contributing/engineering.md#comments)).
- **Commits follow [commits.md](docs/contributing/commits.md):** a Conventional Commit subject with a listed scope, and an `Assisted-by:` or `Co-authored-by:` trailer for your work. The sign-off (`Signed-off-by:`) certifies the Developer Certificate of Origin, so only the person who submits the change adds it.
- **Decisions are not yours to make.** A change to a principle, a licence, a data flow, the insights layer or money needs a decision record, which a maintainer decides ([workflow.md](docs/contributing/workflow.md#decision-records)).
- **Never open an issue, a pull request or a comment on your own:** a person reviews and submits them ([CONTRIBUTING.md](CONTRIBUTING.md#ai-assisted-contributions)).

## Ittro rules

- Write only erasable TypeScript (`type`, `interface`, `import type`): no enums, namespaces, or parameter properties. The code stays TypeScript 7 ready and runs under Node type stripping. The toolchain is pinned to TypeScript 6 until a TypeScript parser supports TypeScript 7.
- Every Muse Spark call uses strict structured output (`json_schema`, `strict: true`, `additionalProperties: false`, all keys in `required`). The relay accepts an answer only when `status` is `completed` and the JSON parses; anything else is an error, never an empty default.
- A wrong "yes" is the worst outcome. "I can't tell, turn the product" always beats a guess.
- Spoken counts and claims are computed, never fixed lines: "I checked six products" states the actual number checked.
- The phone never holds the Meta API key. Only the relay calls Meta.
- Test on the real phone over wireless adb, never the emulators. Ask before any download, deploy, or public action.
