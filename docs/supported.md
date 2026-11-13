# Supported chains, tokens and providers

This page lists all the chains, block explorers, price providers and built-in tokens of actual-crypto-sync. The ids are the values to use in the config. See [docs/configuration.md](configuration.md) for how to use them.

## Ask for a new one

Open an issue with the related form:

- [New chain](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-chain.yml)
- [New block explorer](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-explorer.yml)
- [New price provider](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-price-provider.yml)
- [New token](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-token.yml)

To add one yourself, see [docs/development.md](development.md).

## Chains and block explorers

| Chain   | Id        | Native token | Has tokens | Block explorers                                                                               |
| ------- | --------- | ------------ | ---------- | --------------------------------------------------------------------------------------------- |
| TRON    | `tron`    | TRX          | Yes, TRC20 | [TronGrid](https://www.trongrid.io) (`trongrid`)                                              |
| Bitcoin | `bitcoin` | BTC          | No         | [mempool.space](https://mempool.space) (`mempool-space`), and any mempool or Esplora instance |

To use your own mempool or Esplora instance, set `api_url` on the `mempool-space` explorer. See [Settings of each entry](configuration.md#settings-of-each-entry).

## Price providers

| Price provider                         | Id          | Currencies                                              |
| -------------------------------------- | ----------- | ------------------------------------------------------- |
| [CoinGecko](https://www.coingecko.com) | `coingecko` | Most fiat currencies, for example EUR, USD, GBP and JPY |

## Built-in tokens

An account uses a built-in token by its symbol only. To use another token, [add it to the config](configuration.md#tokens).

| Chain     | Symbol | Kind             | Decimals | Decimals in notes | Contract                             | CoinGecko id |
| --------- | ------ | ---------------- | -------- | ----------------- | ------------------------------------ | ------------ |
| `tron`    | `TRX`  | Native           | 6        | 6                 |                                      | `tron`       |
| `tron`    | `USDT` | Contract (TRC20) | 6        | 6                 | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | `tether`     |
| `bitcoin` | `BTC`  | Native           | 8        | 8                 |                                      | `bitcoin`    |
