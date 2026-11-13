<h1 align="center">actual-crypto-sync</h1>

<p align="center">
  Keeps off-budget <a href="https://actualbudget.org">Actual Budget</a> accounts in line with the value of your crypto wallets.
</p>

<p align="center">
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/actions/workflows/ci.yml"><img src="https://github.com/NicosKaralis/actual-crypto-sync/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/releases/latest"><img src="https://img.shields.io/github/v/release/NicosKaralis/actual-crypto-sync?sort=semver" alt="Latest release" /></a>
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/pkgs/container/actual-crypto-sync"><img src="https://img.shields.io/badge/image-ghcr.io-blue?logo=docker&logoColor=white" alt="Docker image on GHCR" /></a>
  <a href="https://actualbudget.org"><img src="https://img.shields.io/badge/Actual-26.11.0-8719e0" alt="Actual server 26.11.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/NicosKaralis/actual-crypto-sync" alt="MIT license" /></a></p>

> **Work in progress.** Nothing is released yet, and the config format may still change before v1.0.0.

## Getting Started

actual-crypto-sync is a command-line tool. It is free and open source, and it is written in TypeScript for Node.js. Each run does these steps:

1. It reads the balance of each wallet from a block explorer.
2. It reads the current price of each token from a price provider.
3. It writes one adjustment transaction per account per day, so the account shows what the wallet is worth.

The note of each transaction shows the balance, the change since the last run and the price, for example:

```
156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.6 EUR)
```

The tool runs once and exits. Run it on a schedule, for example with cron or a Kubernetes CronJob.

If you want to contribute, read [CONTRIBUTING.md](CONTRIBUTING.md). We would love to have you.

Want to say thanks? Click the ⭐ at the top of the page.

## Key Links

- [Discussions](https://github.com/NicosKaralis/actual-crypto-sync/discussions/categories/q-a) for questions.
- [Issues](https://github.com/NicosKaralis/actual-crypto-sync/issues/new/choose) for bugs and requests.
- [Milestones](https://github.com/NicosKaralis/actual-crypto-sync/milestones) for the work planned for each version, and the [roadmap](ROADMAP.md) for the ideas for later.
- [Actual Budget documentation](https://actualbudget.org/docs).

## Supported

| Chain   | Tokens                             | Block explorers | Price providers |
| ------- | ---------------------------------- | --------------- | --------------- |
| TRON    | TRX, and TRC20 tokens such as USDT | TronGrid        | CoinGecko       |
| Bitcoin | BTC                                | mempool.space   | CoinGecko       |

The code lets contributors add more chains, block explorers, price providers and tokens.

## Before You Use It

- This project is not affiliated with Actual Budget.
- It is not financial advice.
- It writes to your budget. Back up your budget first, and start with `--dry-run`. With `--dry-run`, the tool shows what it will do and writes nothing.

## Installation

There will be two ways to run the tool:

1. **The Docker image** on GitHub Container Registry, for amd64 and arm64. Run it with docker compose, a Kubernetes CronJob or cron. This is the recommended way.
1. **From source** with Node.js 26.13.1 or later, for development.

The image and the full setup guide come with v1.0.0.

## Getting Help

- **A question:** ask in [Discussions](https://github.com/NicosKaralis/actual-crypto-sync/discussions/categories/q-a).
- **A bug, or a request for a new chain, explorer, price provider or token:** open an [issue](https://github.com/NicosKaralis/actual-crypto-sync/issues/new/choose) with the related form.
- **A security issue:** do not open a public issue. Read [SECURITY.md](SECURITY.md).

**Do not put API keys, passwords, session tokens or full wallet addresses in an issue or a discussion.** A short address, for example `TC9F...R2MJ`, is sufficient.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you start. [CODE_REVIEW_GUIDELINES.md](CODE_REVIEW_GUIDELINES.md) tells you what a reviewer checks in a pull request. All commits use [Conventional Commits](https://www.conventionalcommits.org), because the changelog and the versions come from them.

All participants must follow the [Code of Conduct](CODE_OF_CONDUCT.md).

### Key files

- [`config.example.yml`](config.example.yml): an example config, with an explanation of each setting.
- [`src/tokens.yml`](src/tokens.yml): the built-in tokens. To add a token, add it here.
- [`src/chains/`](src/chains): one folder per chain, with its block explorers.
- [`src/prices/`](src/prices): one file per price provider.
- [`src/actual.ts`](src/actual.ts): reads and writes the budget through `@actual-app/api`.

### Feature Requests

To ask for a new feature, open an issue with the [feature request form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=feature-request.yml). To ask for a new chain, block explorer, price provider or token, open an [issue](https://github.com/NicosKaralis/actual-crypto-sync/issues/new/choose) with the related form. The [milestones](https://github.com/NicosKaralis/actual-crypto-sync/milestones) show the work planned for each version, and the [roadmap](ROADMAP.md) shows the ideas for later. To show that you want an existing request, add a 👍 reaction to its first comment.

## AI Use

This project is built with a lot of help from AI, mostly Claude Code, and AI-assisted contributions are welcome. See [AI, Claude Code and other agents](CONTRIBUTING.md#ai-claude-code-and-other-agents) for what that means.

## License

[MIT](LICENSE)
