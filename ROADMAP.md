# Roadmap

This page lists the ideas for the future of the tool. Nothing on it has a version or a date. The order can change.

The work that is planned for a version is not on this page. It is on the [milestone](https://github.com/NicosKaralis/actual-crypto-sync/milestones) of that version, for example `v1.1.0`. A milestone lists its issues, and shows which are done.

## How a request is planned

To propose an idea, open an issue with the [feature request form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=feature-request.yml). To tell us that an item is important to you, add a 👍 reaction or a comment to its issue.

1. A new issue gets the `needs triage` label.
2. The maintainer reads it, and agrees on the approach with you in the issue. This includes whether the change breaks existing users.
3. The maintainer then does one of these:
   - **For the next versions:** gives the issue the `planned` label and adds it to the milestone of a version. Bug fixes and small features go this way.
   - **For later:** adds it to this page, with a link to the issue. Large features with no version yet go this way.
   - **Not planned:** closes the issue, with the reason.
4. When an item on this page gets a version, the maintainer adds its issue to the milestone and removes it from this page. When the maintainer decides not to do an item, the maintainer moves it to [Dropped](#dropped), with a page that tells why.
5. When a pull request merges into `develop`, a workflow replaces `planned` with `awaiting release` on each issue that the pull request closes. It finds them in the description and in the commit messages, as `Closes #12`, `Fixes #12` or `Resolves #12`. The issue stays open until the next release brings the work to `main`. That release closes it.

When a version is released, its milestone closes automatically. Its closed issues lose the `awaiting release` label.

## Later

- **Bitcoin xpub and zpub.** The tool finds all the addresses of an HD wallet and adds their balances.
- **More EVM chains.** Base, Arbitrum and Polygon. Their native coin and ERC20 tokens.
- **Solana.** SOL and SPL tokens.
- **More explorers.** For example blockchain.com for Bitcoin and Tronscan for TRON.
- **More price providers.** For example Kraken, Binance and CryptoCompare.
- **Import each transfer.** Import each on-chain transfer as a transaction, not one value adjustment per day.
- **Actual API keys.** Use the first Actual release with API keys, and recommend API keys for login.
- **A configurable request interval.** In serial mode, set the time between two requests.
- **One price id per token.** Review the tokens whose price id differs by chain. For example, CoinGecko prices USDT as `tether` on TRON and Ethereum, but as `binance-bridged-usdt-bnb-smart-chain` on BNB Smart Chain. CoinPaprika prices ETH as `eth-ethereum` on Ethereum, but as `eth-ethereum-token` on BNB Smart Chain.

## Dropped

These ideas are not planned. Each one links to a page that tells why.

- [One token across chains in one account](docs/dropped/one-token-across-chains.md)
