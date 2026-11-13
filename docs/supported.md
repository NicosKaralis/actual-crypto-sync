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

| Chain   | Id        | Coin | Coin's CoinGecko id | Coin's CoinPaprika id | Has tokens | Block explorers                                                                               |
| ------- | --------- | ---- | ------------------- | --------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| TRON    | `tron`    | TRX  | `tron`              | `trx-tron`            | Yes, TRC20 | [TronGrid](https://www.trongrid.io) (`trongrid`)                                              |
| Bitcoin | `bitcoin` | BTC  | `bitcoin`           | `btc-bitcoin`         | No         | [mempool.space](https://mempool.space) (`mempool-space`), and any mempool or Esplora instance |

An account uses a chain's coin by its symbol, for example `token: TRX`.

To use your own mempool or Esplora instance, set `api_url` on the `mempool-space` explorer. See [Settings of each entry](configuration.md#settings-of-each-entry).

## Price providers

| Price provider                         | Id            | Currencies                                              |
| -------------------------------------- | ------------- | ------------------------------------------------------- |
| [CoinGecko](https://www.coingecko.com) | `coingecko`   | Most fiat currencies, for example EUR, USD, GBP and JPY |
| [CoinPaprika](https://coinpaprika.com) | `coinpaprika` | 40 fiat currencies, for example EUR, USD, GBP and JPY   |

CoinPaprika's free API needs no key. It allows 20,000 requests a month and is for personal use only. A run sends one request for each token that your accounts use.

## Built-in tokens

An account uses a built-in token by its symbol only. To use another token, [add it to the config](configuration.md#tokens).

| Chain  | Symbol   | Standard | Decimals | Decimals in notes | Contract                             | CoinGecko id    | CoinPaprika id          |
| ------ | -------- | -------- | -------- | ----------------- | ------------------------------------ | --------------- | ----------------------- |
| `tron` | `USDT`   | TRC20    | 6        | 6                 | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | `tether`        | `usdt-tether`           |
| `tron` | `USDD`   | TRC20    | 18       | 8                 | `TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz` | `usdd`          | `usdd-usdd`             |
| `tron` | `TUSD`   | TRC20    | 18       | 8                 | `TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4` | `true-usd`      | `tusd-trueusd`          |
| `tron` | `USD1`   | TRC20    | 18       | 8                 | `TPFqcBAaaUMCSVRCqPaQ9QnzKhmuoLR6Rc` | `usd1-wlfi`     | `usd1-usd1`             |
| `tron` | `WBTC`   | TRC20    | 8        | 8                 | `TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9` | `bitcoin-trc20` | `btct-bitcoin-trc20`    |
| `tron` | `WETH`   | TRC20    | 18       | 8                 | `THb4CqiFdwNHsWsQCs4JhzwjMWys4aqCbF` | `weth`          | `weth-weth`             |
| `tron` | `JST`    | TRC20    | 18       | 8                 | `TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9` | `just`          | `jst-just`              |
| `tron` | `SUN`    | TRC20    | 18       | 8                 | `TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S` | `sun-token`     | `sun-sun`               |
| `tron` | `BTT`    | TRC20    | 18       | 8                 | `TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4` | `bittorrent`    | `bttc-bittorrent-chain` |
| `tron` | `WIN`    | TRC20    | 6        | 6                 | `TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7` | `wink`          | `win-winklink`          |
| `tron` | `SUNDOG` | TRC20    | 18       | 8                 | `TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT` | `sundog`        | `sundog-sundog`         |

`WBTC` and `WETH` are wrapped bitcoin and ether on TRON: TRC20 tokens, not the coins of the Bitcoin and Ethereum chains. Each has its own price at the providers. CoinPaprika does not list WETH on TRON, so it uses its price of WETH on Ethereum, the same as CoinGecko's `weth`.
