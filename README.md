# actual-crypto-sync

> **Work in progress.** Nothing is released yet, and the config format may still change before v1.0.0.

Keeps off-budget [Actual Budget](https://actualbudget.org) accounts in line with the value of your crypto wallets.

Each run does these steps:

1. It reads the balance of each wallet from a block explorer.
2. It reads the current price of each token from a price provider.
3. It writes one adjustment transaction per account per day, so the account shows what the wallet is worth.

The note of each transaction shows the balance, the change since the last run and the price, for example:

```
156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.6 EUR)
```

The tool runs once and exits. Run it on a schedule, for example with cron or a Kubernetes CronJob.

## Supported

v1.0 supports these chains:

- **TRON:** TRX and TRC20 tokens, such as USDT.
- **Bitcoin:** BTC.

The code lets contributors add more chains, block explorers, price providers and tokens. The [roadmap](ROADMAP.md) shows what can come next.

## Before you use it

- This project is not affiliated with Actual Budget.
- It is not financial advice.
- It writes to your budget. Back up your budget first, and start with `--dry-run`. With `--dry-run`, the tool shows what it will do and writes nothing.

The full setup guide comes with v1.0.0.

## Get help

- **A question:** ask in [Discussions](https://github.com/NicosKaralis/actual-crypto-sync/discussions/categories/q-a).
- **A bug, or a request for a new chain, explorer, price provider or token:** open an [issue](https://github.com/NicosKaralis/actual-crypto-sync/issues/new/choose) with the related form.
- **A security issue:** do not open a public issue. Read [SECURITY.md](SECURITY.md).

**Do not put API keys, passwords, session tokens or full wallet addresses in an issue or a discussion.** A short address, for example `TC9F...R2MJ`, is sufficient.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you start. All commits use [Conventional Commits](https://www.conventionalcommits.org), because the changelog and the versions come from them.

All participants must follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## AI use

This project is built with a lot of help from AI, mostly Claude Code, and AI-assisted contributions are welcome. See [AI, Claude Code and other agents](CONTRIBUTING.md#ai-claude-code-and-other-agents) for what that means.

## License

[MIT](LICENSE)
