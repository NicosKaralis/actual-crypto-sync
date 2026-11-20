# Configuration

actual-crypto-sync reads one YAML file. This page tells you about each key, its default, and the errors that you can see.

[`config.example.yml`](../config.example.yml) shows all the keys in one file, with a comment on each key. Start from a copy of it.

## Where the file is

The tool reads the config from the first of these:

1. The `--config <path>` option.
2. The `CONFIG_FILE` environment variable.
3. `/config/config.yml`.

## Check the file in your editor

[`config.schema.json`](../config.schema.json) is a JSON Schema for the config. An editor with YAML support uses it to check the file and to complete the keys while you type. It knows the chains, the explorers, the price providers and the settings of each one. An account can name any token: the tool checks that its chain has it.

For VS Code, install the [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) by Red Hat. Then put this line at the top of your config file, as in `config.example.yml`:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/NicosKaralis/actual-crypto-sync/main/config.schema.json
```

Other editors that use the YAML language server read the same line, for example Neovim and Zed. JetBrains IDEs can map the schema to the file in their JSON Schema settings.

The schema checks the shape of the file. The tool checks more when it starts: the `${VAR}` values, the addresses, the tokens of accounts, the currency and duplicates. So a file that the editor accepts can still give an error. The schema on `main` is for the latest release.

## Secrets and `${VAR}`

Do not write secrets in the config file. Write `${NAME}`, and the tool reads the value from the environment variable `NAME` when it starts.

- `${NAME}` works in all string values, also inside a longer string, for example `http://${HOST}:5006`.
- If the variable is not set, the tool stops with an error that names the variable. The error never shows a value.
- The `actual.auth` values must be a `${VAR}` reference. The tool refuses a secret that is written in the file.

Wallet addresses are not secret, but they tell everybody what you own. Thus, the examples put them in environment variables too.

## Top level

| Key        | Required | What it is                                                |
| ---------- | -------- | --------------------------------------------------------- |
| `actual`   | Yes      | The Actual server, the budget and how to log in.          |
| `prices`   | Yes      | The currency of the budget and the price providers.       |
| `chains`   | No       | Settings for each chain, for example its block explorers. |
| `tokens`   | No       | Tokens that are not built in.                             |
| `accounts` | Yes      | The Actual accounts to keep in line with your wallets.    |

An unknown key is an error. This applies at all levels, so a spelling mistake does not go unseen.

## `actual`

```yaml
actual:
  server_url: http://actual:5006
  sync_id: ${ACTUAL_BUDGET_SYNC_ID}
  auth:
    session: ${ACTUAL_SESSION_TOKEN}
  # encryption_password: ${ACTUAL_ENCRYPTION_PASSWORD}
```

| Key                   | Required | Default | What it is                                                                                        |
| --------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------- |
| `server_url`          | Yes      |         | The URL of the Actual server, as the tool reaches it. `http` or `https`.                          |
| `sync_id`             | Yes      |         | The ID of the budget. In Actual, open **Settings**, then **Advanced settings**, then **Sync ID**. |
| `auth`                | Yes      |         | How the tool logs in. Set exactly one of `session`, `password` and `api_key`.                     |
| `encryption_password` | No       |         | The password of an end-to-end encrypted budget.                                                   |

### `auth`

| Key        | Use it for                                                                           |
| ---------- | ------------------------------------------------------------------------------------ |
| `session`  | A session token from a normal login, with a password or OpenID. The recommended way. |
| `password` | The server password, on a server with one user and no OpenID.                        |
| `api_key`  | An Actual API key, on servers newer than 26.11.0.                                    |

[docs/authentication.md](authentication.md) tells you which method to use, and how to get its secret.

### `encryption_password`

`encryption_password` is not a login. It decrypts a budget that has end-to-end encryption. Set it only for such a budget. It can be a `${VAR}` reference or a value in the file, but a `${VAR}` reference is better.

## `prices`

```yaml
prices:
  currency: eur
  providers:
    - coingecko:
        demo_api_key: ${COINGECKO_API_KEY}
    - coinpaprika
```

| Key         | Required | What it is                                                                              |
| ----------- | -------- | --------------------------------------------------------------------------------------- |
| `currency`  | Yes      | The currency of your budget, as an ISO 4217 code: `eur`, `usd`, `jpy`. Any letter case. |
| `providers` | Yes      | The price providers, in the order that the tool tries them.                             |

At least one of the providers must support the currency. The notes always show the currency as an upper-case code, for example `EUR`.

### How the tool uses the providers

The tool asks the first provider for the price of all the tokens. If the provider fails, or does not have a price for a token, the tool asks the next provider for the remaining tokens.

If no provider gives a price for a token, the tool does not write to the accounts of that token. The run continues for the other accounts and then ends with an error. The tool never writes a price of 0, because that sets the account to zero.

## `chains`

```yaml
chains:
  tron:
    explorers: trongrid
  bitcoin:
    explorers:
      - mempool-space:
          api_url: http://mempool.lan/api
          label: home-mempool
      - mempool-space
```

`chains` is optional. Each key is a chain id, and its only key is `explorers`. If you do not list a chain, or do not set its `explorers`, the tool uses the default explorers of that chain.

| Chain      | Default explorers        |
| ---------- | ------------------------ |
| `tron`     | `trongrid`               |
| `bitcoin`  | `mempool-space`          |
| `ethereum` | `json-rpc`, `blockscout` |
| `bsc`      | `json-rpc`               |

### How the tool uses the explorers

The tool reads each wallet one time, with all the tokens of the accounts on that wallet. It asks the first explorer of the chain. If that explorer fails, it asks the next explorer for the full wallet. One run never mixes two explorers for one wallet.

An explorer that cannot read contract tokens is skipped for a wallet with a contract token.

If all the explorers fail for a wallet, the tool does not write to the accounts of that wallet. The run continues for the other accounts and then ends with an error.

## Lists of explorers and providers

`prices.providers` and `chains.<chain>.explorers` take the same three forms.

One name:

```yaml
providers: coingecko
```

A list of names:

```yaml
providers: [coingecko]
```

A list of entries. Each entry is a name, or a map with one key, the name, and its settings as the value:

```yaml
providers:
  - coingecko:
      api_url: https://api.coingecko.com/api/v3
      serial: true
  - coingecko
```

An entry with no settings (`- coingecko:`) is the same as the name alone.

You can list the same explorer or provider more than one time with different settings. For example, list your own mempool instance first and the public one after it. Two entries with the same name and the same settings are an error.

### Settings of each entry

These settings work on all entries:

| Setting  | Default                     | What it is                                                                                                        |
| -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `label`  | The id, then `id#2`, `id#3` | The name of the entry in logs, traces and metric labels. Two entries cannot have the same label.                  |
| `serial` | `false`                     | `true` sends one request at a time, with a fixed wait after each request. Use it if the API limits your requests. |

Each explorer and provider also has its own settings:

| Id              | Kind              | Setting        | Default                                           | What it is                                                                                                                                                                                 |
| --------------- | ----------------- | -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trongrid`      | TRON explorer     | `api_url`      | `https://api.trongrid.io`                         | The TronGrid API.                                                                                                                                                                          |
| `trongrid`      | TRON explorer     | `api_key`      |                                                   | A TronGrid API key. It gives a higher rate limit. Use `${VAR}`.                                                                                                                            |
| `mempool-space` | Bitcoin explorer  | `api_url`      | `https://mempool.space/api`                       | Any mempool or Esplora API, for example your own instance.                                                                                                                                 |
| `json-rpc`      | Ethereum explorer | `api_url`      | `https://ethereum-rpc.publicnode.com`             | Any Ethereum JSON-RPC endpoint: your own node, or a provider's URL with its key in it. Use `${VAR}` for the key.                                                                           |
| `json-rpc`      | BSC explorer      | `api_url`      | `https://bsc-rpc.publicnode.com`                  | Any BNB Smart Chain JSON-RPC endpoint: your own node, or a provider's URL with its key in it. Use `${VAR}` for the key.                                                                    |
| `blockscout`    | Ethereum explorer | `api_url`      | `https://eth.blockscout.com/api`                  | Any Blockscout API, up to and including `/api`.                                                                                                                                            |
| `blockscout`    | Ethereum explorer | `api_key`      |                                                   | A free Blockscout API key, from [dev.blockscout.com](https://dev.blockscout.com). It gives higher limits. The default `api_url` is then `https://api.blockscout.com/v2/api`. Use `${VAR}`. |
| `etherscan`     | Ethereum explorer | `api_url`      | `https://api.etherscan.io/v2/api`                 | The Etherscan API V2.                                                                                                                                                                      |
| `etherscan`     | Ethereum explorer | `api_key`      |                                                   | Required. A free Etherscan API key. Use `${VAR}`.                                                                                                                                          |
| `etherscan`     | BSC explorer      | `api_url`      | `https://api.etherscan.io/v2/api`                 | The Etherscan API V2.                                                                                                                                                                      |
| `etherscan`     | BSC explorer      | `api_key`      |                                                   | Required. An Etherscan API key of a paid plan: the free plan does not cover BNB Smart Chain. Use `${VAR}`.                                                                                 |
| `coingecko`     | Price provider    | `api_url`      | `https://api.coingecko.com/api/v3`                | The CoinGecko API.                                                                                                                                                                         |
| `coingecko`     | Price provider    | `demo_api_key` |                                                   | A free CoinGecko Demo key. It gives a higher rate limit. Use `${VAR}`.                                                                                                                     |
| `coingecko`     | Price provider    | `pro_api_key`  |                                                   | A paid CoinGecko Pro key. The default `api_url` is then `https://pro-api.coingecko.com/api/v3`. Use `${VAR}`.                                                                              |
| `coinpaprika`   | Price provider    | `api_url`      | `https://api.coinpaprika.com/v1`                  | The CoinPaprika API.                                                                                                                                                                       |
| `coinpaprika`   | Price provider    | `api_key`      |                                                   | A CoinPaprika API key of a paid plan (pro, business or enterprise). A free plan's key does not work. The default `api_url` is then `https://api-pro.coinpaprika.com/v1`. Use `${VAR}`.     |
| `coinmarketcap` | Price provider    | `api_url`      | `https://pro-api.coinmarketcap.com/public-api/v2` | The CoinMarketCap API without a key.                                                                                                                                                       |
| `coinmarketcap` | Price provider    | `api_key`      |                                                   | A CoinMarketCap API key. The free Basic plan works. The default `api_url` is then `https://pro-api.coinmarketcap.com/v2`. Use `${VAR}`.                                                    |

Any other setting is an error, so a misspelled setting cannot be ignored without a message.

CoinMarketCap works without a key. All users on the same IP address then share one rate limit, so the tool tries a request again after 1, 2 and 4 seconds when the limit is reached. With `api_key`, the tool sends the key in a header to the keyed API, and does not try again.

CoinGecko has two kinds of key, and both start with `CG-`. Put a free Demo key in `demo_api_key`, or a paid Pro key in `pro_api_key`. The tool sends each kind with its own header, and a Pro key to the Pro API. Set only one of the two. The keys never show in logs, traces or errors.

In serial mode, the wait after each request is:

| Id              | Wait   |
| --------------- | ------ |
| `trongrid`      | 1 s    |
| `mempool-space` | 1 s    |
| `json-rpc`      | 1 s    |
| `blockscout`    | 1 s    |
| `etherscan`     | 0.35 s |
| `coingecko`     | 6 s    |
| `coinpaprika`   | 0.1 s  |
| `coinmarketcap` | 2 s    |

### Rate limits

When an API limits your requests, the tool logs a warning one time for each entry. The warning tells you what you can do, for example:

- TronGrid: add an `api_key`, or set `serial: true`.
- mempool.space: set `serial: true`, or set `api_url` to your own mempool instance.
- JSON-RPC: set `serial: true`, or set `api_url` to your own node or a provider with an API key.
- Blockscout: add a free `api_key`, or set `serial: true`.
- Etherscan: set `serial: true`. In serial mode: run less often, or use a paid Etherscan plan.
- CoinGecko: add a free Demo key with `demo_api_key`, run less often, or add another provider after it.
- CoinPaprika: run less often, add an `api_key`, or add another provider after it.
- CoinMarketCap: add an `api_key`, run less often, or add another provider after it.

The run then continues with the next explorer or provider.

### What each explorer reads

- **`trongrid`** reads TRX and all TRC20 tokens of a wallet in one request. TRX includes the TRX that you staked, and the TRX that you staked and delegated to other accounts.
- **`mempool-space`** reads BTC. It counts only confirmed transactions, because transactions in the mempool can still change.
- **`json-rpc`** reads the coin (ETH or BNB) and each token of the wallet in one batch request.
- **`blockscout`** and **`etherscan`** read the coin and each token with one request each.

### Ethereum explorers

With no `explorers` for `ethereum`, the tool asks `json-rpc` (a public PublicNode endpoint) first, and `blockscout` if it fails. Neither needs a key. Without a key, Blockscout's public instance allows only a few requests, enough for a daily run with a few accounts. Add a free `api_key` for more.

To use your own node, or a provider such as Infura or Alchemy, set `api_url` on `json-rpc`. These providers put the key in the URL, so use `${VAR}` for it:

```yaml
chains:
  ethereum:
    explorers:
      - json-rpc:
          api_url: https://mainnet.infura.io/v3/${INFURA_API_KEY}
      - blockscout
```

The tool never shows a key in logs, traces or errors. In a URL path, it shows `***` in place of a long run of letters and digits.

`etherscan` needs an API key, so the tool uses it only when you list it. A free key from [etherscan.io](https://etherscan.io/apis) covers Ethereum:

```yaml
chains:
  ethereum:
    explorers:
      - json-rpc
      - etherscan:
          api_key: ${ETHERSCAN_API_KEY}
```

`json-rpc` reads at the latest block. The other explorers can be a few seconds behind it, so two explorers can give slightly different balances for a wallet that just received a transaction.

### BNB Smart Chain explorers

With no `explorers` for `bsc`, the tool asks `json-rpc` (a public PublicNode endpoint). It needs no key. There is no public Blockscout instance for BNB Smart Chain. To use your own node or a provider, set `api_url` on `json-rpc`, as on Ethereum.

The default is the only explorer, so a run fails for your BNB Smart Chain accounts when PublicNode is down. To have a backup, add a second `json-rpc` entry with another public node, for example BNB Chain's own `https://bsc-dataseed.bnbchain.org`. It needs no key either. The tool asks it only when PublicNode fails. Give it a `label`, so that logs and metrics tell the two entries apart:

```yaml
chains:
  bsc:
    explorers:
      - json-rpc
      - json-rpc:
          api_url: https://bsc-dataseed.bnbchain.org
          label: bnb-dataseed
```

`etherscan` works on BNB Smart Chain only with a key of a paid Etherscan plan. With a free key, Etherscan answers "Free API access is not supported for this chain".

```yaml
chains:
  bsc:
    explorers:
      - json-rpc
      - etherscan:
          api_key: ${ETHERSCAN_API_KEY}
```

## `tokens`

The tool has built-in tokens, for example USDT on TRON. An account uses them by their symbol only. [docs/supported.md](supported.md#built-in-tokens) lists them all, with their contracts and price ids.

To use another token, add it to `tokens`:

```yaml
tokens:
  - chain: tron
    symbol: WTRX
    contract: TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR
    decimals: 6
    price_ids:
      coingecko: wrapped-tron
```

| Key                | Required | Default                   | What it is                                                                  |
| ------------------ | -------- | ------------------------- | --------------------------------------------------------------------------- |
| `chain`            | Yes      |                           | A chain with tokens. Bitcoin has none.                                      |
| `symbol`           | Yes      |                           | Upper-case letters and digits only. Accounts use it, and the notes show it. |
| `contract`         | Yes      |                           | The address of the token contract. It must be a valid address on the chain. |
| `decimals`         | Yes      |                           | The decimals of the contract, from 0 to 255.                                |
| `display_decimals` | No       | `decimals`, but at most 8 | The decimals in the notes. At most `decimals`.                              |
| `price_ids`        | Yes      |                           | The id of the token at each price provider. At least one.                   |

A token in `tokens` can have the symbol of a built-in token on the same chain. It then replaces the built-in token in your config, with its own contract, decimals and price ids. Two tokens in `tokens` on one chain cannot have the same symbol or the same contract.

### Add a token safely

Many fake tokens copy the name and symbol of a real token. Before you add a token, do these checks:

1. Find the contract on a block explorer, for example [Tronscan](https://tronscan.org) for TRON. Make sure that it is the real token, not a copy.
2. Copy the decimals from the contract page.
3. Find the token on CoinGecko. Make sure that the contract on the CoinGecko page is the same contract. The id is in the URL of the page, for example `wrapped-tron` in `coingecko.com/en/coins/wrapped-tron`.

If you think that other users want the token, ask for it to be built in with the [new token form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-token.yml).

## `accounts`

```yaml
accounts:
  - name: "TRON: TRX"
    chain: tron
    token: TRX
    wallets:
      - ${TRON_WALLET_ADDRESS}
```

| Key       | Required | What it is                                                                                |
| --------- | -------- | ----------------------------------------------------------------------------------------- |
| `name`    | Yes      | The Actual account, by its name or its id. Each account can be in the list one time only. |
| `chain`   | Yes      | `tron`, `bitcoin`, `ethereum` or `bsc`.                                                   |
| `token`   | Yes      | The chain's coin (TRX, BTC, ETH or BNB), a built-in token, or a token from `tokens`.      |
| `wallets` | Yes      | The wallet addresses. The account shows the total of all its wallets.                     |

The account in Actual must be open and off budget. Each account holds one token on one chain. For TRX and USDT on the same wallet, make two accounts.

`wallets` takes the same forms as the explorers: one address, a list, or an inline list.

```yaml
wallets: ${BTC_ADDRESS}
wallets:
  - ${BTC_ADDRESS}
wallets: ["${BTC_ADDRESS}"]
```

In an inline list, put quotes around `${...}`. If you do not, YAML reads it as a map.

An Ethereum or BNB Smart Chain address is `0x` and 40 hex digits. The same address works on both chains. The tool reads it as text with or without quotes, but put quotes around it if you write it in the file: your editor reads `0x...` without quotes as a number. If the address has upper and lower case letters, the case is its checksum (EIP-55), and the tool checks it. An address all in lower case or all in upper case has no checksum.

You can use the same wallet in more than one account. The tool reads it one time.

### Several wallets in one account

An account can have more than one wallet, all on its chain. The account shows the total of its wallets, and the note shows the total only.

```yaml
accounts:
  - name: "TRON: TRX, all wallets"
    chain: tron
    token: TRX
    wallets:
      - ${TRON_WALLET_ADDRESS}
      - ${TRON_SAVINGS_ADDRESS}
```

- If the tool cannot read one of the wallets, it does not write to the account in that run. It never writes a total that leaves out a wallet. The run continues for the other accounts and then ends with an error.
- Each wallet can be in the list one time only. Bitcoin bech32 addresses (`bc1...`) can have upper-case or lower-case letters. The tool compares them in lower case, so `bc1q...` and `BC1Q...` are the same wallet.
- Each wallet can be read by a different explorer, for example when the first explorer fails for one wallet. The metrics then show each explorer's part. See [Metrics](monitoring.md#metrics).

## What the tool writes

For each account, the tool writes one transaction per day:

- **The amount** is the difference between the value of the wallet and the balance of the account. Thus, the account balance becomes the value of the wallet.
- **The payee** is `AutoImporter`.
- **The note** shows the balance, the change since the last sync, the price and the value, for example `156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.6 EUR)`.
- **The transaction is not cleared.** If the tool runs again on the same day, it updates that transaction. The first run of the next day clears it.

The tool never changes or deletes a transaction that you added. If two runs write a transaction for the same day, the next run deletes the extra one.

The tool also never changes or deletes a reconciled transaction. If you reconcile the account in Actual, today's sync transaction can be part of the reconciliation. A later run on the same day then keeps it as it is:

- If the value of the wallet did not change, the reconciled transaction already has the right amount, and the run does not change it.
- If the value changed, the run skips the account and logs the warning `today's sync transaction is reconciled; skipped until tomorrow`. The run still exits with 0.

The first run of the next day writes a new transaction, so the account shows the value of the wallet again.

To find the change since the last sync, the tool reads the note of the last sync transaction. It searches the last 50 transactions of the account before today. If there are more than 50 other transactions between two syncs, the change counts from zero. Uncleared sync transactions older than those 50 stay uncleared.

"Today" is the date in the time zone of the tool. Set the `TZ` environment variable, for example `TZ=Europe/Lisbon`. The Docker image uses UTC if you do not set it.

## Environment variables

| Variable                      | Default              | What it is                                                                                              |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `CONFIG_FILE`                 | `/config/config.yml` | The path of the config file. `--config` overrides it.                                                   |
| `ACTUAL_DATA_DIR`             | `/cache`             | Where the tool keeps its copy of the budget. The tool creates it. It must be writable.                  |
| `TZ`                          | `UTC` in the image   | The time zone that sets the date of "today".                                                            |
| `LOG_FORMAT`                  | `text`               | `text` for people, or `json` for log systems. See [docs/monitoring.md](monitoring.md#logs).             |
| `OTEL_EXPORTER_OTLP_ENDPOINT` |                      | The base URL of an OpenTelemetry collector, for traces and metrics. Without it, the tool sends nothing. |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf`      | `http/protobuf`, `http/json` or `grpc`. It must match what your collector takes.                        |
| `OTEL_EXPORTER_OTLP_HEADERS`  |                      | Headers for the collector, such as an API key, as `key=value,key=value`.                                |

The variables that your config uses with `${VAR}` are also necessary.

The tool reads all the standard `OTEL_*` variables: separate endpoints and protocols for traces and metrics, TLS, timeouts, sampling, and more. See [Sending metrics and traces](opentelemetry.md) for all of them, with examples. For the logs, and the metrics and traces that the tool sends, see [docs/monitoring.md](monitoring.md).

## Errors

The tool checks all of the config before it connects to Actual. If the config has a problem, the tool writes one error and stops with exit code 1. The error starts with the place of the problem in the file:

```
2026-11-13T06:00:00.000Z ERROR accounts[2].token: "XYZ" isn't built in on tron; define it in tokens: stage=config
```

`accounts[2]` is the third account, because the count starts at 0.

These are the errors that you can see most often:

| Error                                                                                | What to do                                                                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `config: can't read /config/config.yml (ENOENT)`                                     | Mount the file at that path, or set `--config` or `CONFIG_FILE`.                                |
| `<path>: unknown key; expected ...`                                                  | Correct the spelling of the key. The error lists the correct keys.                              |
| `<path>: unknown setting; expected ...`                                              | Correct the spelling of the setting. The error lists the settings of that explorer or provider. |
| `<path>: required`                                                                   | Add the key.                                                                                    |
| `<path>: environment variable NAME is not set`                                       | Set the variable for the tool, for example in your Secret or env file.                          |
| `actual.auth: set one of session, password, api_key`                                 | Add one login method. See [docs/authentication.md](authentication.md).                          |
| `actual.auth: set only one of session, password, api_key; found ...`                 | Remove all methods but one.                                                                     |
| `actual.auth.<method>: use ${VAR}, never the secret itself`                          | Put the secret in an environment variable, and write `${NAME}` in the file.                     |
| `prices.currency: "..." isn't an ISO 4217 currency code`                             | Use a 3-letter code, for example `eur`.                                                         |
| `prices.currency: "..." isn't supported by ...`                                      | Use another currency, or add a provider that supports it.                                       |
| `<path>: unknown explorer "..." for tron; supported: ...`                            | Use one of the listed explorers.                                                                |
| `<path>: unknown price provider "..."; supported: ...`                               | Use one of the listed providers.                                                                |
| `accounts[N].token: "..." isn't built in on tron; define it in tokens:`              | Add the token to `tokens`, or correct the symbol.                                               |
| `accounts[N].token: none of the listed price providers (...) has a price id for ...` | Add a `price_ids` entry for one of your providers.                                              |
| `accounts[N].wallets[0]: not a valid tron address`                                   | Correct the address. The error does not show it.                                                |
| `accounts[N].wallets[I]: the same wallet as accounts[N].wallets[J]`                  | Remove one of the two. The error does not show the address.                                     |
| `accounts[N].name: "..." is already used by accounts[M]`                             | Each account can be in the list one time only.                                                  |

Errors from the login and the budget download are in [docs/authentication.md](authentication.md#troubleshooting).

Errors during the run do not stop the other accounts:

| Error                                                                                     | What it means                                                                                                     |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `<account>: account "..." not found`                                                      | No open account in the budget has that name or id. Names must be the same, also the letter case.                  |
| `<account>: account "..." is on budget; only off-budget accounts are synced`              | Make the account off budget in Actual, or use another account.                                                    |
| `<account>: account "..." is closed`                                                      | Reopen the account, or remove it from the config.                                                                 |
| `tron:USDT: no price from any provider; its accounts are skipped`                         | All providers failed for that token. The warnings before it tell you why.                                         |
| `TC9F...R2MJ: every explorer failed (trongrid: ...)`                                      | No explorer could read the wallet. The reason of each explorer is in the parentheses, and the warnings before it. |
| `TC9F...R2MJ: every explorer failed (trongrid: trongrid: account not found: TC9F...R2MJ)` | The address never received a transaction, so TRON does not know it yet.                                           |
