<h1 align="center">actual-crypto-sync</h1>

<p align="center">
  Keeps off-budget <a href="https://actualbudget.org">Actual Budget</a> accounts in line with the value of your crypto wallets.
</p>

<p align="center">
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/actions/workflows/ci.yml"><img src="https://github.com/NicosKaralis/actual-crypto-sync/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/releases/latest"><img src="https://img.shields.io/github/v/release/NicosKaralis/actual-crypto-sync?sort=semver" alt="Latest release" /></a>
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/pkgs/container/actual-crypto-sync"><img src="https://img.shields.io/badge/image-ghcr.io-blue?logo=docker&logoColor=white" alt="Docker image on GHCR" /></a>
  <a href="https://actualbudget.org"><img src="https://img.shields.io/badge/Actual-26.11.0-8719e0" alt="Actual server 26.11.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/NicosKaralis/actual-crypto-sync" alt="MIT license" /></a>
</p>

## Getting Started

actual-crypto-sync is a command-line tool. It is free and open source, and it is written in TypeScript for Node.js. Each run does these steps:

1. It reads the balance of each wallet from a block explorer.
2. It reads the current price of each token from a price provider.
3. It writes one adjustment transaction per account per day, so the account shows what the wallet is worth.

The note of each transaction shows the balance, the change since the last run and the price, for example:

```
156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.6 EUR)
```

The tool runs once and exits. Run it on a schedule, for example with cron or a Kubernetes CronJob. [What the tool writes](docs/configuration.md#what-the-tool-writes) tells you more about the transactions.

### Supported

Popular tokens are built in, so you need only their symbol in the config. Any other token works too: you [define it in the config](docs/configuration.md#tokens).

- **Chains:** TRON (TRX), Bitcoin (BTC)
- **Built-in tokens:** TRX, USDT, BTC
- **Block explorers:** TronGrid, mempool.space (or any mempool or Esplora instance)
- **Price providers:** CoinGecko

The [full list](docs/supported.md) has the ids, the contracts and the currencies.

To ask for a new [chain](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-chain.yml), [block explorer](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-explorer.yml), [price provider](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-price-provider.yml) or [token](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-token.yml), open an issue. The [roadmap](ROADMAP.md) shows what can come next.

## Before You Use It

- This project is not affiliated with Actual Budget.
- It is not financial advice.
- It writes to your budget. Back up your budget first, and start with `--dry-run`. With `--dry-run`, the tool shows what it will do and writes nothing.
- It is tested with Actual server **26.11.0**. Other versions can work, but they are not tested.

## Installation

The tool is a Docker image on GitHub Container Registry, for amd64 and arm64. [docs/installation.md](docs/installation.md) has the image tags, all the ways to run the tool, and the environment variables.

### Quick start

1. **Back up your budget.** In Actual, open **Settings**, then **Export data**.
2. **Create the accounts.** In Actual, create one off-budget account for each token of each wallet. For example, a TRON wallet with TRX and USDT needs two accounts: `TRON: TRX` and `TRON: USDT`.
3. **Choose a login method and get its secret.** For most servers, use a session token of a dedicated user. [docs/authentication.md](docs/authentication.md) tells you how.

   | Your server                            | Method                  |
   | -------------------------------------- | ----------------------- |
   | One user, password login               | `password` or `session` |
   | OpenID, or more than one user          | `session`               |
   | A server with API keys (after 26.11.0) | `api_key`               |

4. **Write the config.** Copy [`config.example.yml`](config.example.yml) to `config.yml`, and change it for your server, accounts and wallets. [docs/configuration.md](docs/configuration.md) tells you about each setting.
5. **Write the secrets in an env file**, for example `.env`:

   ```sh
   ACTUAL_BUDGET_SYNC_ID=...
   ACTUAL_SESSION_TOKEN=...
   TRON_WALLET_ADDRESS=TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ
   BTC_ADDRESS=bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v
   ```

6. **Run it one time with `--dry-run`.** The tool reads everything and logs the transactions that it would write:

   ```sh
   docker run --rm --env-file .env -e TZ=Europe/Lisbon \
     -v "$PWD/config.yml:/config/config.yml:ro" \
     ghcr.io/nicoskaralis/actual-crypto-sync:1 --dry-run
   ```

   The container must reach `actual.server_url`. If Actual runs in Docker on the same computer, add `--network` with the network of Actual.

7. **Run it without `--dry-run`**, and check the transactions in Actual.
8. **Run it on a schedule**, for example one time each day, with [cron](docs/installation.md#cron), [Docker Compose](docs/installation.md#docker-compose) or [Kubernetes](docs/installation.md#kubernetes).

Set `TZ` to your time zone. The date of the transaction is "today" in that time zone, and the image uses UTC if you do not set it.

## Key Links

- [Installation](docs/installation.md): the image tags, and how to run the tool with cron, Docker Compose or Kubernetes.
- [Configuration](docs/configuration.md): each setting, and the errors that you can see.
- [Authentication](docs/authentication.md): how the tool logs in to Actual.
- [Supported](docs/supported.md): all the chains, tokens, block explorers and price providers.
- [Development](docs/development.md): set up the project, test it, and add a chain, explorer, price provider or token.
- [Logs, metrics and traces](docs/monitoring.md): the log format, the metrics and the traces, for monitoring and alerts.
- [Discussions](https://github.com/NicosKaralis/actual-crypto-sync/discussions/categories/q-a) for questions.
- [Issues](https://github.com/NicosKaralis/actual-crypto-sync/issues/new/choose) for bugs and requests.
- [Milestones](https://github.com/NicosKaralis/actual-crypto-sync/milestones) for the work planned for each version, and the [roadmap](ROADMAP.md) for the ideas for later.
- [Actual Budget documentation](https://actualbudget.org/docs).

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

### AI Use

This project is built with a lot of help from AI, mostly Claude Code, and AI-assisted contributions are welcome. See [AI, Claude Code and other agents](CONTRIBUTING.md#ai-claude-code-and-other-agents) for what that means.

## License

[MIT](LICENSE)

Want to say thanks? Click the ⭐ at the top of the page.
