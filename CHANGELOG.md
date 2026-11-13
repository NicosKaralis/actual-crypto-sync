# Changelog

## [1.1.1](https://github.com/NicosKaralis/actual-crypto-sync/compare/v1.1.0...v1.1.1) (2026-11-13)


### Bug Fixes

* copy the GHCR image to Docker Hub with the same digest ([ccfed9a](https://github.com/NicosKaralis/actual-crypto-sync/commit/ccfed9a5dddb2df5cecad614cc08fff3dc552a6a))
* copy the GHCR image to Docker Hub with the same digest ([097aed5](https://github.com/NicosKaralis/actual-crypto-sync/commit/097aed509b97b53735d2a48bd92bcd7c4b0533fa)), closes [#41](https://github.com/NicosKaralis/actual-crypto-sync/issues/41)
* label release images with the commit of their tag ([7970ea4](https://github.com/NicosKaralis/actual-crypto-sync/commit/7970ea4116cf01df5aa068c9a15cc8387e600c2b)), closes [#42](https://github.com/NicosKaralis/actual-crypto-sync/issues/42)
* show text links in place of badges on Docker Hub ([54d0ac7](https://github.com/NicosKaralis/actual-crypto-sync/commit/54d0ac7b923e7b5f53dcd40fb7192e8a564561cb))
* show text links in place of badges on Docker Hub ([a83306f](https://github.com/NicosKaralis/actual-crypto-sync/commit/a83306f85a3d0a1518d3d7248adccfd7aeddbc94)), closes [#44](https://github.com/NicosKaralis/actual-crypto-sync/issues/44)

## [1.1.0](https://github.com/NicosKaralis/actual-crypto-sync/compare/v1.0.0...v1.1.0) (2026-11-13)

This release adds more TRON tokens, a second price provider and a JSON Schema for the config. The image is now also on Docker Hub. Tested with Actual server 26.11.0.

### Features

- **More built-in TRON tokens:** USDD, TUSD, USD1, WBTC, WETH, JST, SUN, BTT, WIN and SUNDOG. A config uses them by their symbol, like TRX and USDT. On TRON, wrapped BTC and wrapped ETH are TRC20 tokens, so their symbols are WBTC and WETH. ([#28](https://github.com/NicosKaralis/actual-crypto-sync/pull/28), [c2146d7](https://github.com/NicosKaralis/actual-crypto-sync/commit/c2146d764e80a69cc2bf72f7aff143aac460a9f6))
- **Small prices in notes:** a price below 0.1 keeps 4 significant digits. For example, a note shows 0.0000002928 EUR for BTT, not 0.0000 EUR. ([#28](https://github.com/NicosKaralis/actual-crypto-sync/pull/28), [f92d2cc](https://github.com/NicosKaralis/actual-crypto-sync/commit/f92d2cca33cb8a4777ab25521676d28b4813ff90))
- **CoinGecko API keys:** set `demo_api_key` for a free Demo key, or `pro_api_key` for a paid Pro key. A key gives a higher rate limit. With `pro_api_key`, the tool uses the Pro API. ([#30](https://github.com/NicosKaralis/actual-crypto-sync/pull/30), [721dc24](https://github.com/NicosKaralis/actual-crypto-sync/commit/721dc24dc41c545584a394f889c11d25567ef07a))
- **CoinPaprika:** a second price provider. It needs no key. Put it after CoinGecko in `providers`. When CoinGecko fails or has no price for a token, the tool asks CoinPaprika. ([#30](https://github.com/NicosKaralis/actual-crypto-sync/pull/30), [e57cce6](https://github.com/NicosKaralis/actual-crypto-sync/commit/e57cce626620b9b4d3f16039702b2203345a8545))
- **JSON Schema for the config:** `config.schema.json`. Put the `yaml-language-server` line at the top of `config.yml`. Then an editor with YAML support checks the file and completes the keys. ([#32](https://github.com/NicosKaralis/actual-crypto-sync/pull/32), [f60c84b](https://github.com/NicosKaralis/actual-crypto-sync/commit/f60c84b849ad605846b57882221bd06fa46a65d1))
- **Custom tokens replace built-in tokens:** a `tokens:` entry with the symbol of a built-in token replaces that token in your config. A new built-in token therefore never breaks your config. ([#32](https://github.com/NicosKaralis/actual-crypto-sync/pull/32), [a35918f](https://github.com/NicosKaralis/actual-crypto-sync/commit/a35918f90e5e67e811d3f18c9b9649f91d88b8aa))
- **Docker Hub:** the image is also at `docker.io/nicoskaralis/actual-crypto-sync`. It has the same tags and the same digest as on GHCR. GHCR stays the main registry. ([#34](https://github.com/NicosKaralis/actual-crypto-sync/pull/34), [302590b](https://github.com/NicosKaralis/actual-crypto-sync/commit/302590b8770de1328faae06d2dafb169ead2b40f))
- **A patch release for each Actual version:** when Actual releases a new version, the tool gets a patch release for it. Renovate updates the tool 1 day after the Actual release. The patch release follows when all the tests pass, including the end-to-end tests against the new server. ([#37](https://github.com/NicosKaralis/actual-crypto-sync/pull/37), [57432c7](https://github.com/NicosKaralis/actual-crypto-sync/commit/57432c75d4fc7b2e87ef0421e849627caae82121), [3eace5a](https://github.com/NicosKaralis/actual-crypto-sync/commit/3eace5a3d8811798c57606ba7d975ec7e3dd6d3f))

### Bug Fixes

- **Unknown settings are errors:** an unknown setting of an explorer or a price provider now stops the tool with an error. The error lists the correct settings. Before, the tool ignored the setting, but the docs said that each unknown key is an error. Before you update, check the explorer and provider settings in your config for spelling mistakes. ([#32](https://github.com/NicosKaralis/actual-crypto-sync/pull/32), [69cf1bd](https://github.com/NicosKaralis/actual-crypto-sync/commit/69cf1bdee5d7f4953f0a5f82d62f35b94e70fa45))

### Documentation

- **Privacy and data:** a new section in the README tells which data the tool sends, and to which services. ([#26](https://github.com/NicosKaralis/actual-crypto-sync/pull/26), [14945f8](https://github.com/NicosKaralis/actual-crypto-sync/commit/14945f89fce9af156476e748fc5c6bffe007e3ab))

### For contributors

- **End-to-end tests:** each pull request runs the tool against a real Actual server in Docker. ([#22](https://github.com/NicosKaralis/actual-crypto-sync/pull/22), [fbe1ff6](https://github.com/NicosKaralis/actual-crypto-sync/commit/fbe1ff643cc5dc9a776f402c6d799a651bc0c1d0))
- **Weekly live checks:** each week, a workflow checks the built-in tokens, the explorers and the price providers against the real services. ([#29](https://github.com/NicosKaralis/actual-crypto-sync/pull/29), [17d9841](https://github.com/NicosKaralis/actual-crypto-sync/commit/17d98417bc5120d8197d19bff3eb68dd3752cef7))

See the [README](https://github.com/NicosKaralis/actual-crypto-sync#readme) to get started, and the [docs](https://github.com/NicosKaralis/actual-crypto-sync/tree/main/docs) for each setting.

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
