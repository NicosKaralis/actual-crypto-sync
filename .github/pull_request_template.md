## What changed

<!--
What does this pull request change, and why? Link the issue, for example "Closes #12".
Open the pull request into `develop`, not `main` (see CONTRIBUTING.md).
-->

## Checklist

[CODE_REVIEW_GUIDELINES.md](https://github.com/NicosKaralis/actual-crypto-sync/blob/main/CODE_REVIEW_GUIDELINES.md) tells you what a reviewer checks.

- [ ] The title uses [Conventional Commits](https://www.conventionalcommits.org), for example `feat: add the Tronscan explorer`.
- [ ] I added tests for the change, or the change needs no tests. Tests use recorded fixtures, not real APIs.
- [ ] I updated the docs and `config.example.yml`, or the change needs no doc update.
- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass.
- [ ] There are no API keys, passwords, session tokens or real wallet addresses in the code, tests, fixtures or this description.

## Breaking change

<!--
Does the change break existing users? These are breaking changes: the config format, CLI flags
and env vars, the note format, the log format, what the tool writes to Actual, and metric names
and labels.
If yes, mark the commit with `!` and a `BREAKING CHANGE:` footer (see CONTRIBUTING.md), and
tell users here what they must do. A workflow then adds the `breaking change` label.
-->

No.
