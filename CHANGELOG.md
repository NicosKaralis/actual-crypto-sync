# Changelog

## [1.1.0](https://github.com/NicosKaralis/actual-crypto-sync/compare/v1.0.0...v1.1.0) (2026-11-13)


### Features

* accept a CoinGecko Demo or Pro API key ([721dc24](https://github.com/NicosKaralis/actual-crypto-sync/commit/721dc24dc41c545584a394f889c11d25567ef07a))
* add a JSON Schema for the config ([8a34b7c](https://github.com/NicosKaralis/actual-crypto-sync/commit/8a34b7c362576d63809f884640a81336e6c29f17))
* add a JSON Schema for the config ([f60c84b](https://github.com/NicosKaralis/actual-crypto-sync/commit/f60c84b849ad605846b57882221bd06fa46a65d1)), closes [#20](https://github.com/NicosKaralis/actual-crypto-sync/issues/20)
* add CoinPaprika as a second price provider ([1710a0d](https://github.com/NicosKaralis/actual-crypto-sync/commit/1710a0d4dc19a41e29aa086346df0f8c87026c7f))
* add CoinPaprika as a second price provider ([e57cce6](https://github.com/NicosKaralis/actual-crypto-sync/commit/e57cce626620b9b4d3f16039702b2203345a8545)), closes [#19](https://github.com/NicosKaralis/actual-crypto-sync/issues/19)
* add more built-in TRON tokens ([bd9dc3c](https://github.com/NicosKaralis/actual-crypto-sync/commit/bd9dc3caf93668ec3ac8131703a6519f42e8dec9))
* add more built-in TRON tokens ([c2146d7](https://github.com/NicosKaralis/actual-crypto-sync/commit/c2146d764e80a69cc2bf72f7aff143aac460a9f6)), closes [#17](https://github.com/NicosKaralis/actual-crypto-sync/issues/17)
* keep 4 significant digits in small prices ([f92d2cc](https://github.com/NicosKaralis/actual-crypto-sync/commit/f92d2cca33cb8a4777ab25521676d28b4813ff90))
* let a custom token replace a built-in one ([a35918f](https://github.com/NicosKaralis/actual-crypto-sync/commit/a35918f90e5e67e811d3f18c9b9649f91d88b8aa))
* refuse unknown settings of explorers and providers ([69cf1bd](https://github.com/NicosKaralis/actual-crypto-sync/commit/69cf1bdee5d7f4953f0a5f82d62f35b94e70fa45))


### Bug Fixes

* let the schema accept any token in an account ([22ae94a](https://github.com/NicosKaralis/actual-crypto-sync/commit/22ae94a3630bf900cc4608452b228972e52a9378))

## 1.0.0 (2026-11-13)

The first release of actual-crypto-sync. It keeps off-budget [Actual Budget](https://actualbudget.org) accounts in line with the value of your crypto wallets. Each run reads the wallet balances and the prices, and writes one adjustment transaction per account per day. Tested with Actual server 26.11.0.

### Features

- **Chains:** TRON (TRX and TRC20 tokens) and Bitcoin. Each address is checked in full, so a typo is an error.
- **Block explorers:** TronGrid for TRON, and mempool.space or any mempool or Esplora instance for Bitcoin. With a list of explorers, the tool uses the next one when one fails.
- **Prices:** CoinGecko, in most fiat currencies.
- **Tokens:** TRX, USDT (TRC20) and BTC are built in, so a config uses them by their symbol. Any other token can be defined in the config.
- **Transactions:** one per account per day, with a note that shows the balance, the change since the last sync, the price and the value. A run on the same day updates the transaction, and the next day clears it.
- **Login to Actual:** a password, a session token (also for servers with OpenID), or an API key on servers that have them. Encrypted budgets work with `encryption_password`.
- **Config:** one YAML file. Secrets and wallets come from environment variables with `${VAR}`. The tool checks all of the config before it connects to anything.
- **Rate limits:** a serial mode for each explorer and price provider, and advice in the log when an API limits requests.
- **Logs:** text by default, or JSON with `LOG_FORMAT=json` for log systems. Wallets show only in a short form, and secrets never show.
- **Metrics and traces:** OpenTelemetry over OTLP/HTTP, with a metric for the time of the last successful sync.
- **CLI:** `--dry-run` reads everything and writes nothing. `--debug` logs each request.
- **Docker image:** `ghcr.io/nicoskaralis/actual-crypto-sync`, for amd64 and arm64.

See the [README](https://github.com/NicosKaralis/actual-crypto-sync#readme) to get started, and the [docs](https://github.com/NicosKaralis/actual-crypto-sync/tree/main/docs) for each setting.
