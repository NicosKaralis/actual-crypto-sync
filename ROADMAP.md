# Roadmap

This page tells you what can come after v1.0. Nothing on it has a date. The order can change.

Ideas come in as issues. To propose a new idea, open an issue with the [feature request form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=feature-request.yml). To tell us that an item is important to you, add a 👍 reaction or a comment to its issue.

This is how an idea gets on this page:

1. A new issue gets the `needs triage` label.
2. The maintainer reads it, and agrees on the approach with you in the issue. This includes whether the change breaks existing users.
3. The maintainer then gives the issue the `planned` label and adds it to this page, with a link to the issue. Or the maintainer closes the issue, with the reason.
4. The pull request that makes the change removes it from this page.

## Next (v1.1)

- **End-to-end tests.** Each test run starts a temporary Actual server and a mock of the explorers and price providers. Then it runs the tool against them. The tests run locally and in CI.
- **More built-in TRON tokens.** For example USDD, BTT, WTRX, JST, SUN, WIN and USDC. The list is not final.
- **A CoinGecko API key, and a second price provider.** An API key gives higher rate limits. When CoinGecko fails, the tool uses the second provider.
- **A JSON Schema for the config.** Your editor can then check the config file and complete its keys.

## Later

These ideas have no version yet.

- **Several wallets in one account.** The account shows the total of all its wallets.
- **One token across chains in one account.** For example, USDT on TRON and on Ethereum in one account. This needs several wallets in one account, and a second chain with USDT.
- **Bitcoin xpub and zpub.** The tool finds all the addresses of an HD wallet and adds their balances.
- **EVM chains.** Ethereum first, then Base, Arbitrum and Polygon. ETH and ERC20 tokens.
- **Solana.** SOL and SPL tokens.
- **More explorers.** For example blockchain.com for Bitcoin and Tronscan for TRON.
- **More price providers.** For example Kraken, Binance and CryptoCompare.
- **Import each transfer.** Import each on-chain transfer as a transaction, not one value adjustment per day.
- **Actual API keys.** Use the first Actual release with API keys, and recommend API keys for login.
- **A configurable request interval.** In serial mode, set the time between two requests.
