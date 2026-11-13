# Contributing to actual-crypto-sync

Thank you for your help. This guide gives the basics. A full guide will come later. It will have the development setup and the PR checklist.

## What this project is

actual-crypto-sync is a command-line tool. It keeps off-budget [Actual Budget](https://actualbudget.org) accounts equal to the value of crypto wallets.

Each run does these steps:

1. It reads the balance of each wallet.
2. It reads the current price of each token.
3. It writes one adjustment transaction per account per day.

v1.0 supports TRON and Bitcoin. The code lets contributors add more chains, block explorers and price providers.

The project uses TypeScript and runs on Node.js. The project is not affiliated with Actual Budget.

## License

The project uses the [MIT License](LICENSE). When you open a pull request, you release your contribution under the same license.

## Code of conduct

All participants must follow the [Code of Conduct](CODE_OF_CONDUCT.md). The Code of Conduct applies to issues, pull requests, discussions and all other project spaces.

## Report a bug

To report a bug, open an issue with the bug report form. The form asks for this information:

- The version that you run.
- How you run the tool: cron, Kubernetes CronJob, docker compose or by hand.
- Your config. Remove all secrets and wallet addresses first.
- The log of one run with `--debug`.

**Do not put API keys, passwords, session tokens or full wallet addresses in an issue.** The repository is public. All text in an issue stays in its history.

A short address is sufficient, for example `TC9F...R2MJ`. The logs show addresses in the same short form.

To request a new feature, use the feature request form. To request a new chain, block explorer, price provider or token, use the related issue form. Do not use the bug report form for these requests.

The [roadmap](ROADMAP.md) tells you how a request becomes a planned item.

## Report a security issue

Do not open a public issue for a security issue. Use GitHub [private vulnerability reporting](https://github.com/NicosKaralis/actual-crypto-sync/security/advisories/new).

[SECURITY.md](SECURITY.md) tells you which issues are security issues. It also tells you which versions get fixes.

## Commit messages

All commits use [Conventional Commits](https://www.conventionalcommits.org). [Release Please](https://github.com/googleapis/release-please) reads the commit messages. It writes the changelog from them. It also sets the next version from them. Thus, the commit type is important.

| Type        | Use                                          | Release |
| ----------- | -------------------------------------------- | ------- |
| `feat:`     | A new feature                                | Minor   |
| `fix:`      | A bug fix                                    | Patch   |
| `docs:`     | Documentation only                           | None    |
| `test:`     | Tests only                                   | None    |
| `refactor:` | A code change that does not change behaviour | None    |
| `chore:`    | Maintenance, dependencies or tooling         | None    |
| `ci:`       | The GitHub workflows                         | None    |

This is an example of a commit message with a body:

```
feat: read token balances from Tronscan

Tronscan returns all TRC20 balances in one request. Thus, a wallet with
many tokens needs fewer requests than with TronGrid.
```

A breaking change has a mark. The mark is `!` after the type, or a `BREAKING CHANGE:` footer. One mark is sufficient for a major version. This project uses the two marks together.

For a breaking change, do these steps:

1. Add `!` after the type, for example `feat!:`.
2. Add a `BREAKING CHANGE:` footer.
3. In the footer, tell users what they must do.

This is an example of a breaking change:

```
feat!: rename the account key `wallets` to `addresses`

The name `addresses` is clearer. An account can now have one address.

BREAKING CHANGE: In each account of your config, change `wallets:`
to `addresses:`.
```

Put one logical change in each commit. If the subject does not give the reason for the change, write the reason in the body.

Pull request titles use the same format. CI checks the commits. CI also checks the pull request title.

## AI, Claude Code and other agents

AI tools are welcome in this project. I am not a TypeScript professional. I started this project to solve a personal problem. I also use the project to learn.

Claude Code wrote a large part of this project. It writes code. It reviews docs. It helps with checks. (Hi from Claude 👋)

You can use AI tools for your contributions too. Keep the use under control with these rules:

- **You own what you send.** Read every change before you open a pull request. You must understand each change. You must be able to explain it in a review.
- **Follow the coding style.** Biome formats and lints the code. Run `npm run format` and `npm run lint`. Run `npm run typecheck` to check the types.
- **Add tests for each new feature or fix.** The tests must show that the change works. The tests must also prevent future breaks. Unit tests use recorded fixtures. They do not call a real explorer, price provider or Actual server. Run `npm test` to run the tests.
- **Keep your agent files out of the repository.** Agent files include plans, prompts and agent instruction files, for example `AGENTS.md`. The project does not need these files for each contributor. Add them to `.git/info/exclude`. Then Git does not commit them. You do not need to change `.gitignore`.

If you follow these rules, you can contribute in the way that is comfortable for you.
