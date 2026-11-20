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

| Chain    | Id         | Coin | Coin's CoinGecko id | Coin's CoinPaprika id | Has tokens | Block explorers                                                                                                                                                                                             |
| -------- | ---------- | ---- | ------------------- | --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TRON     | `tron`     | TRX  | `tron`              | `trx-tron`            | Yes, TRC20 | [TronGrid](https://www.trongrid.io) (`trongrid`)                                                                                                                                                            |
| Bitcoin  | `bitcoin`  | BTC  | `bitcoin`           | `btc-bitcoin`         | No         | [mempool.space](https://mempool.space) (`mempool-space`), and any mempool or Esplora instance                                                                                                               |
| Ethereum | `ethereum` | ETH  | `ethereum`          | `eth-ethereum`        | Yes, ERC20 | JSON-RPC (`json-rpc`): [PublicNode](https://ethereum-rpc.publicnode.com) or any node; [Blockscout](https://eth.blockscout.com) (`blockscout`); [Etherscan](https://etherscan.io) (`etherscan`, needs a key) |

An account uses a chain's coin by its symbol, for example `token: TRX`.

To use your own mempool or Esplora instance, set `api_url` on the `mempool-space` explorer. See [Settings of each entry](configuration.md#settings-of-each-entry).

On Ethereum, the tool uses `json-rpc` and then `blockscout` when the config lists no explorers. Neither needs a key. To use your own node, or a provider such as Infura or Alchemy, set `api_url` on `json-rpc` to its URL, with the key in it. The tool never shows that URL's path in logs or spans. `blockscout` takes an optional free API key for higher limits. `etherscan` needs a free API key, so it is used only when you list it. See [Ethereum explorers](configuration.md#ethereum-explorers).

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

`WBTC` and `WETH` on TRON are wrapped bitcoin and ether: TRC20 tokens, not BTC on Bitcoin or ETH on Ethereum. Each has its own price at the providers. CoinPaprika does not list WETH on TRON, so it uses its price of WETH on Ethereum, the same as CoinGecko's `weth`.

| Chain      | Symbol  | Standard | Decimals | Decimals in notes | Contract                                     | CoinGecko id      | CoinPaprika id            |
| ---------- | ------- | -------- | -------- | ----------------- | -------------------------------------------- | ----------------- | ------------------------- |
| `ethereum` | `USDT`  | ERC20    | 6        | 6                 | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | `tether`          | `usdt-tether`             |
| `ethereum` | `USDC`  | ERC20    | 6        | 6                 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | `usd-coin`        | `usdc-usd-coin`           |
| `ethereum` | `DAI`   | ERC20    | 18       | 8                 | `0x6B175474E89094C44Da98b954EedeAC495271d0F` | `dai`             | `dai-dai`                 |
| `ethereum` | `USDD`  | ERC20    | 18       | 8                 | `0x4f8e5DE400DE08B164E7421B3EE387f461beCD1A` | `usdd`            | `usdd-usdd`               |
| `ethereum` | `TUSD`  | ERC20    | 18       | 8                 | `0x0000000000085d4780B73119b644AE5ecd22b376` | `true-usd`        | `tusd-trueusd`            |
| `ethereum` | `USD1`  | ERC20    | 18       | 8                 | `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` | `usd1-wlfi`       | `usd1-usd1`               |
| `ethereum` | `BTT`   | ERC20    | 18       | 8                 | `0xC669928185DbCE49d2230CC9B0979BE6DC797957` | `bittorrent`      | `bttc-bittorrent-chain`   |
| `ethereum` | `WBTC`  | ERC20    | 8        | 8                 | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` | `wrapped-bitcoin` | `wbtc-wrapped-bitcoin`    |
| `ethereum` | `WETH`  | ERC20    | 18       | 8                 | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | `weth`            | `weth-weth`               |
| `ethereum` | `STETH` | ERC20    | 18       | 8                 | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` | `staked-ether`    | `steth-lido-staked-ether` |
| `ethereum` | `LINK`  | ERC20    | 18       | 8                 | `0x514910771AF9Ca656af840dff83E8264EcF986CA` | `chainlink`       | `link-chainlink`          |
| `ethereum` | `UNI`   | ERC20    | 18       | 8                 | `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984` | `uniswap`         | `uni-uniswap`             |

`STETH` is Lido's staked ether (stETH). Its balance grows every day without a transfer, so the account shows a change on each run.
