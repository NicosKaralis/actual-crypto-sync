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

| Chain           | Id         | Coin | Has tokens | Block explorers                                                                                                                                                                                             |
| --------------- | ---------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TRON            | `tron`     | TRX  | Yes, TRC20 | [TronGrid](https://www.trongrid.io) (`trongrid`)                                                                                                                                                            |
| Bitcoin         | `bitcoin`  | BTC  | No         | [mempool.space](https://mempool.space) (`mempool-space`), and any mempool or Esplora instance                                                                                                               |
| Ethereum        | `ethereum` | ETH  | Yes, ERC20 | JSON-RPC (`json-rpc`): [PublicNode](https://ethereum-rpc.publicnode.com) or any node; [Blockscout](https://eth.blockscout.com) (`blockscout`); [Etherscan](https://etherscan.io) (`etherscan`, needs a key) |
| BNB Smart Chain | `bsc`      | BNB  | Yes, BEP20 | JSON-RPC (`json-rpc`): [PublicNode](https://bsc-rpc.publicnode.com) or any node; [Etherscan](https://bscscan.com) (`etherscan`, needs a key of a paid plan)                                                 |

An account uses a chain's coin by its symbol, for example `token: TRX`.

To use your own mempool or Esplora instance, set `api_url` on the `mempool-space` explorer. See [Settings of each entry](configuration.md#settings-of-each-entry).

On Ethereum, the tool uses `json-rpc` and then `blockscout` when the config lists no explorers. Neither needs a key. To use your own node, or a provider such as Infura or Alchemy, set `api_url` on `json-rpc` to its URL, with the key in it. The tool never shows that URL's path in logs or spans. `blockscout` takes an optional free API key for higher limits. `etherscan` needs a free API key, so it is used only when you list it. See [Ethereum explorers](configuration.md#ethereum-explorers).

On BNB Smart Chain, the tool uses `json-rpc` when the config lists no explorers. It needs no key. For a backup, add a second `json-rpc` entry with BNB Chain's public node, `https://bsc-dataseed.bnbchain.org`. There is no public Blockscout for this chain. `etherscan` works here only with a key of a paid Etherscan plan. See [BNB Smart Chain explorers](configuration.md#bnb-smart-chain-explorers).

## Price providers

| Price provider                         | Id            | Currencies                                              |
| -------------------------------------- | ------------- | ------------------------------------------------------- |
| [CoinGecko](https://www.coingecko.com) | `coingecko`   | Most fiat currencies, for example EUR, USD, GBP and JPY |
| [CoinPaprika](https://coinpaprika.com) | `coinpaprika` | 40 fiat currencies, for example EUR, USD, GBP and JPY   |

CoinPaprika's free API needs no key. It allows 20,000 requests a month and is for personal use only. A run sends one request for each token that your accounts use.

## Built-in tokens

An account uses a built-in token by its symbol only. To use another token, [add it to the config](configuration.md#tokens).

| Chain  | Symbol   | Standard | Decimals | Decimals in notes | Contract                             |
| ------ | -------- | -------- | -------- | ----------------- | ------------------------------------ |
| `tron` | `USDT`   | TRC20    | 6        | 6                 | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| `tron` | `USDD`   | TRC20    | 18       | 8                 | `TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz` |
| `tron` | `TUSD`   | TRC20    | 18       | 8                 | `TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4` |
| `tron` | `USD1`   | TRC20    | 18       | 8                 | `TPFqcBAaaUMCSVRCqPaQ9QnzKhmuoLR6Rc` |
| `tron` | `WBTC`   | TRC20    | 8        | 8                 | `TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9` |
| `tron` | `WETH`   | TRC20    | 18       | 8                 | `THb4CqiFdwNHsWsQCs4JhzwjMWys4aqCbF` |
| `tron` | `JST`    | TRC20    | 18       | 8                 | `TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9` |
| `tron` | `SUN`    | TRC20    | 18       | 8                 | `TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S` |
| `tron` | `BTT`    | TRC20    | 18       | 8                 | `TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4` |
| `tron` | `WIN`    | TRC20    | 6        | 6                 | `TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7` |
| `tron` | `SUNDOG` | TRC20    | 18       | 8                 | `TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT` |

`WBTC` and `WETH` on TRON are wrapped bitcoin and ether: TRC20 tokens, not BTC on Bitcoin or ETH on Ethereum. Each has its own price at the providers. CoinPaprika does not list WETH on TRON, so it uses its price of WETH on Ethereum, the same as CoinGecko's `weth`.

| Chain      | Symbol  | Standard | Decimals | Decimals in notes | Contract                                     |
| ---------- | ------- | -------- | -------- | ----------------- | -------------------------------------------- |
| `ethereum` | `USDT`  | ERC20    | 6        | 6                 | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| `ethereum` | `USDC`  | ERC20    | 6        | 6                 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| `ethereum` | `DAI`   | ERC20    | 18       | 8                 | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| `ethereum` | `USDD`  | ERC20    | 18       | 8                 | `0x4f8e5DE400DE08B164E7421B3EE387f461beCD1A` |
| `ethereum` | `TUSD`  | ERC20    | 18       | 8                 | `0x0000000000085d4780B73119b644AE5ecd22b376` |
| `ethereum` | `USD1`  | ERC20    | 18       | 8                 | `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` |
| `ethereum` | `BTT`   | ERC20    | 18       | 8                 | `0xC669928185DbCE49d2230CC9B0979BE6DC797957` |
| `ethereum` | `WBTC`  | ERC20    | 8        | 8                 | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |
| `ethereum` | `WETH`  | ERC20    | 18       | 8                 | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| `ethereum` | `STETH` | ERC20    | 18       | 8                 | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` |
| `ethereum` | `LINK`  | ERC20    | 18       | 8                 | `0x514910771AF9Ca656af840dff83E8264EcF986CA` |
| `ethereum` | `UNI`   | ERC20    | 18       | 8                 | `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984` |

`STETH` is Lido's staked ether (stETH). Its balance grows every day without a transfer, so the account shows a change on each run.

| Chain | Symbol  | Standard | Decimals | Decimals in notes | Contract                                     |
| ----- | ------- | -------- | -------- | ----------------- | -------------------------------------------- |
| `bsc` | `USDT`  | BEP20    | 18       | 8                 | `0x55d398326f99059fF775485246999027B3197955` |
| `bsc` | `USDC`  | BEP20    | 18       | 8                 | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| `bsc` | `DAI`   | BEP20    | 18       | 8                 | `0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3` |
| `bsc` | `TUSD`  | BEP20    | 18       | 8                 | `0x40af3827F39D0EAcBF4A168f8D4ee67c121D11c9` |
| `bsc` | `USD1`  | BEP20    | 18       | 8                 | `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` |
| `bsc` | `FDUSD` | BEP20    | 18       | 8                 | `0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409` |
| `bsc` | `BTT`   | BEP20    | 18       | 8                 | `0x352Cb5E19b12FC216548a2677bD0fce83BaE434B` |
| `bsc` | `WIN`   | BEP20    | 18       | 8                 | `0xaeF0d72a118ce24feE3cD1d43d383897D05B4e99` |
| `bsc` | `TRX`   | BEP20    | 6        | 6                 | `0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3` |
| `bsc` | `BTCB`  | BEP20    | 18       | 8                 | `0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c` |
| `bsc` | `WBTC`  | BEP20    | 8        | 8                 | `0x0555E30da8f98308EdB960aa94C0Db47230d2B9c` |
| `bsc` | `ETH`   | BEP20    | 18       | 8                 | `0x2170Ed0880ac9A755fd29B2688956BD959F933F8` |
| `bsc` | `WBNB`  | BEP20    | 18       | 8                 | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| `bsc` | `CAKE`  | BEP20    | 18       | 8                 | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` |
| `bsc` | `LINK`  | BEP20    | 18       | 8                 | `0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD` |

On BNB Smart Chain, `USDT` and `USDC` have 18 decimals, not 6 as on Ethereum and TRON. `ETH` is Binance-Peg Ether, a BEP20 token, not ETH on Ethereum. `TRX`, `WIN` and `BTT` are bridged copies of the TRON tokens. CoinPaprika does not list `TRX` and `WBTC` on BNB Smart Chain, so it uses its price of TRX on TRON and of WBTC on Ethereum. CoinGecko has its own ids for the bridged USDT, USDC, DAI, ETH, TRX and WIN on this chain.

The price providers know each coin and token by an id of their own. The same token on several chains has the same id, because it has the same price, unless the provider lists that chain's copy as a coin of its own.

<details>
<summary>Price providers' mapping</summary>

- **BNB**
  - CoinGecko id: `binancecoin`
  - CoinPaprika id: `bnb-binance-coin`
- **BTC**
  - CoinGecko id: `bitcoin`
  - CoinPaprika id: `btc-bitcoin`
- **BTCB**
  - CoinGecko id: `binance-bitcoin`
  - CoinPaprika id: `btcb-binance-bitcoin`
- **BTT**
  - CoinGecko id: `bittorrent`
  - CoinPaprika id: `bttc-bittorrent-chain`
- **CAKE**
  - CoinGecko id: `pancakeswap-token`
  - CoinPaprika id: `cake-pancakeswap`
- **DAI**
  - CoinGecko id: `dai`; on BNB Smart Chain: `binance-peg-dai`
  - CoinPaprika id: `dai-dai`
- **ETH**
  - CoinGecko id: `ethereum`; on BNB Smart Chain: `binance-peg-weth`
  - CoinPaprika id: `eth-ethereum`; on BNB Smart Chain: `eth-ethereum-token`
- **FDUSD**
  - CoinGecko id: `first-digital-usd`
  - CoinPaprika id: `fdusd-first-digital-usd`
- **JST**
  - CoinGecko id: `just`
  - CoinPaprika id: `jst-just`
- **LINK**
  - CoinGecko id: `chainlink`
  - CoinPaprika id: `link-chainlink`
- **STETH**
  - CoinGecko id: `staked-ether`
  - CoinPaprika id: `steth-lido-staked-ether`
- **SUN**
  - CoinGecko id: `sun-token`
  - CoinPaprika id: `sun-sun`
- **SUNDOG**
  - CoinGecko id: `sundog`
  - CoinPaprika id: `sundog-sundog`
- **TRX**
  - CoinGecko id: `tron`; on BNB Smart Chain: `tron-bsc`
  - CoinPaprika id: `trx-tron`
- **TUSD**
  - CoinGecko id: `true-usd`
  - CoinPaprika id: `tusd-trueusd`
- **UNI**
  - CoinGecko id: `uniswap`
  - CoinPaprika id: `uni-uniswap`
- **USD1**
  - CoinGecko id: `usd1-wlfi`
  - CoinPaprika id: `usd1-usd1`
- **USDC**
  - CoinGecko id: `usd-coin`; on BNB Smart Chain: `binance-bridged-usdc-bnb-smart-chain`
  - CoinPaprika id: `usdc-usd-coin`
- **USDD**
  - CoinGecko id: `usdd`
  - CoinPaprika id: `usdd-usdd`
- **USDT**
  - CoinGecko id: `tether`; on BNB Smart Chain: `binance-bridged-usdt-bnb-smart-chain`
  - CoinPaprika id: `usdt-tether`
- **WBNB**
  - CoinGecko id: `wbnb`
  - CoinPaprika id: `wbnb-wrapped-bnb`
- **WBTC**
  - CoinGecko id: `wrapped-bitcoin`; on TRON: `bitcoin-trc20`
  - CoinPaprika id: `wbtc-wrapped-bitcoin`; on TRON: `btct-bitcoin-trc20`
- **WETH**
  - CoinGecko id: `weth`
  - CoinPaprika id: `weth-weth`
- **WIN**
  - CoinGecko id: `wink`; on BNB Smart Chain: `winklink-bsc`
  - CoinPaprika id: `win-winklink`

</details>
