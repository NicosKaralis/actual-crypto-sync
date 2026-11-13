# Roadmap

This page tells you the ideas for the future of the tool. Nothing on it has a version or a date. The order can change.

The work that is planned for a version is not on this page. It is on the [milestone](https://github.com/NicosKaralis/actual-crypto-sync/milestones) of that version, for example `v1.1.0`. A milestone lists its issues, and shows which are done.

## How a request is planned

To propose an idea, open an issue with the [feature request form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=feature-request.yml). To tell us that an item is important to you, add a 👍 reaction or a comment to its issue.

1. A new issue gets the `needs triage` label.
2. The maintainer reads it, and agrees on the approach with you in the issue. This includes whether the change breaks existing users.
3. The maintainer then does one of these:
   - **For the next versions:** gives the issue the `planned` label and adds it to the milestone of a version. Bug fixes and small features go this way.
   - **For later:** adds it to this page, with a link to the issue. Large features with no version yet go this way.
   - **Not planned:** closes the issue, with the reason.
4. When an item on this page gets a version, the maintainer adds its issue to the milestone and removes it from this page.

When a version is released, its milestone closes automatically.

## Next

These ideas are likely to come first.

- **A CoinGecko API key, and a second price provider.** An API key gives higher rate limits. When CoinGecko fails, the tool uses the second provider.
- **A JSON Schema for the config.** Your editor can then check the config file and complete its keys.

## Later

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
