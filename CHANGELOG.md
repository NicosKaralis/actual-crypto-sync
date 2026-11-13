# Changelog

## 1.0.0 (2026-11-13)

The first release of actual-crypto-sync. It keeps off-budget [Actual Budget](https://actualbudget.org) accounts in line with the value of your crypto wallets. Each run reads the wallet balances and the prices, and writes one adjustment transaction per account per day. Tested with Actual server 26.11.0.

### Features

* **Chains:** TRON (TRX and TRC20 tokens) and Bitcoin. Each address is checked in full, so a typo is an error.
* **Block explorers:** TronGrid for TRON, and mempool.space or any mempool or Esplora instance for Bitcoin. With a list of explorers, the tool uses the next one when one fails.
* **Prices:** CoinGecko, in most fiat currencies.
* **Tokens:** TRX, USDT (TRC20) and BTC are built in, so a config uses them by their symbol. Any other token can be defined in the config.
* **Transactions:** one per account per day, with a note that shows the balance, the change since the last sync, the price and the value. A run on the same day updates the transaction, and the next day clears it.
* **Login to Actual:** a password, a session token (also for servers with OpenID), or an API key on servers that have them. Encrypted budgets work with `encryption_password`.
* **Config:** one YAML file. Secrets and wallets come from environment variables with `${VAR}`. The tool checks all of the config before it connects to anything.
* **Rate limits:** a serial mode for each explorer and price provider, and advice in the log when an API limits requests.
* **Logs:** text by default, or JSON with `LOG_FORMAT=json` for log systems. Wallets show only in a short form, and secrets never show.
* **Metrics and traces:** OpenTelemetry over OTLP/HTTP, with a metric for the time of the last successful sync.
* **CLI:** `--dry-run` reads everything and writes nothing. `--debug` logs each request.
* **Docker image:** `ghcr.io/nicoskaralis/actual-crypto-sync`, for amd64 and arm64.

See the [README](https://github.com/NicosKaralis/actual-crypto-sync#readme) to get started, and the [docs](https://github.com/NicosKaralis/actual-crypto-sync/tree/main/docs) for each setting.
