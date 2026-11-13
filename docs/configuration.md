# Configuration

actual-crypto-sync reads one YAML file. This page tells you about each key, its default, and the errors that you can see.

[`config.example.yml`](../config.example.yml) shows all the keys in one file, with a comment on each key. Start from a copy of it.

## Where the file is

The tool reads the config from the first of these:

1. The `--config <path>` option.
2. The `CONFIG_FILE` environment variable.
3. `/config/config.yml`.

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
    - coingecko
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

| Chain     | Default explorers |
| --------- | ----------------- |
| `tron`    | `trongrid`        |
| `bitcoin` | `mempool-space`   |

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

| Id              | Kind             | Setting   | Default                            | What it is                                                      |
| --------------- | ---------------- | --------- | ---------------------------------- | --------------------------------------------------------------- |
| `trongrid`      | TRON explorer    | `api_url` | `https://api.trongrid.io`          | The TronGrid API.                                               |
| `trongrid`      | TRON explorer    | `api_key` |                                    | A TronGrid API key. It gives a higher rate limit. Use `${VAR}`. |
| `mempool-space` | Bitcoin explorer | `api_url` | `https://mempool.space/api`        | Any mempool or Esplora API, for example your own instance.      |
| `coingecko`     | Price provider   | `api_url` | `https://api.coingecko.com/api/v3` | The CoinGecko API.                                              |

In serial mode, the wait after each request is:

| Id              | Wait |
| --------------- | ---- |
| `trongrid`      | 1 s  |
| `mempool-space` | 1 s  |
| `coingecko`     | 6 s  |

### Rate limits

When an API limits your requests, the tool logs a warning one time for each entry. The warning tells you what you can do, for example:

- TronGrid: add an `api_key`, or set `serial: true`.
- mempool.space: set `serial: true`, or set `api_url` to your own mempool instance.
- CoinGecko: run less often, or add another provider after it.

The run then continues with the next explorer or provider.

### What each explorer reads

- **`trongrid`** reads TRX and all TRC20 tokens of a wallet in one request. TRX includes the TRX that you staked, and the TRX that you staked and delegated to other accounts.
- **`mempool-space`** reads BTC. It counts only confirmed transactions, because transactions in the mempool can still change.

## `tokens`

The tool has built-in tokens, for example USDT on TRON. An account uses them by their symbol only. [docs/supported.md](supported.md#built-in-tokens) lists them all, with their contracts and price ids.

To use another token, add it to `tokens`:

```yaml
tokens:
  - chain: tron
    symbol: SUNDOG
    contract: TXL6rJbvmjD46zeN1JssfgxvSo99qC8MRT
    decimals: 18
    price_ids:
      coingecko: sundog
```

| Key                | Required | Default                   | What it is                                                                  |
| ------------------ | -------- | ------------------------- | --------------------------------------------------------------------------- |
| `chain`            | Yes      |                           | A chain with tokens. Bitcoin has none.                                      |
| `symbol`           | Yes      |                           | Upper-case letters and digits only. Accounts use it, and the notes show it. |
| `contract`         | Yes      |                           | The address of the token contract. It must be a valid address on the chain. |
| `decimals`         | Yes      |                           | The decimals of the contract, from 0 to 255.                                |
| `display_decimals` | No       | `decimals`, but at most 8 | The decimals in the notes. At most `decimals`.                              |
| `price_ids`        | Yes      |                           | The id of the token at each price provider. At least one.                   |

A token in `tokens` cannot use the symbol of a built-in token on the same chain. Thus, a token cannot get the price of the real token by mistake. Two tokens on one chain cannot have the same symbol or the same contract.

### Add a token safely

Many fake tokens copy the name and symbol of a real token. Before you add a token, do these checks:

1. Find the contract on a block explorer, for example [Tronscan](https://tronscan.org) for TRON. Make sure that it is the real token, not a copy.
2. Copy the decimals from the contract page.
3. Find the token on CoinGecko. Make sure that the contract on the CoinGecko page is the same contract. The id is in the URL of the page, for example `sundog` in `coingecko.com/en/coins/sundog`.

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
| `chain`   | Yes      | `tron` or `bitcoin`.                                                                      |
| `token`   | Yes      | A built-in token, or a token from `tokens`.                                               |
| `wallets` | Yes      | The wallet address. In v1.0, one wallet per account.                                      |

The account in Actual must be open and off budget. Each account holds one token on one chain. For TRX and USDT on the same wallet, make two accounts.

`wallets` takes the same forms as the explorers: one address, a list, or an inline list.

```yaml
wallets: ${BTC_ADDRESS}
wallets:
  - ${BTC_ADDRESS}
wallets: ["${BTC_ADDRESS}"]
```

In an inline list, put quotes around `${...}`. If you do not, YAML reads it as a map.

You can use the same wallet in more than one account. The tool reads it one time.

## What the tool writes

For each account, the tool writes one transaction per day:

- **The amount** is the difference between the value of the wallet and the balance of the account. Thus, the account balance becomes the value of the wallet.
- **The payee** is `AutoImporter`.
- **The note** shows the balance, the change since the last sync, the price and the value, for example `156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.6 EUR)`.
- **The transaction is not cleared.** If the tool runs again on the same day, it updates that transaction. The first run of the next day clears it.

The tool never changes or deletes a transaction that you added. If two runs write a transaction for the same day, the next run deletes the extra one.

To find the change since the last sync, the tool reads the note of the last sync transaction. It searches the last 50 transactions of the account before today. If there are more than 50 other transactions between two syncs, the change counts from zero. Uncleared sync transactions older than those 50 stay uncleared.

"Today" is the date in the time zone of the tool. Set the `TZ` environment variable, for example `TZ=Europe/Lisbon`. The Docker image uses UTC if you do not set it.

## Environment variables

| Variable                              | Default              | What it is                                                                                  |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `CONFIG_FILE`                         | `/config/config.yml` | The path of the config file. `--config` overrides it.                                       |
| `ACTUAL_DATA_DIR`                     | `/cache`             | Where the tool keeps its copy of the budget. The tool creates it. It must be writable.      |
| `TZ`                                  | `UTC` in the image   | The time zone that sets the date of "today".                                                |
| `LOG_FORMAT`                          | `text`               | `text` for people, or `json` for log systems. See [docs/monitoring.md](monitoring.md#logs). |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         |                      | The base URL of an OpenTelemetry collector, for traces and metrics.                         |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  |                      | The full URL for traces only. It overrides the base URL.                                    |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` |                      | The full URL for metrics only. It overrides the base URL.                                   |
| `OTEL_EXPORTER_OTLP_TIMEOUT`          | `5000`               | The export timeout in milliseconds.                                                         |

The variables that your config uses with `${VAR}` are also necessary.

For the logs, and the metrics and traces that the tool sends to the collector, see [docs/monitoring.md](monitoring.md).

## Errors

The tool checks all of the config before it connects to Actual. If the config has a problem, the tool writes one error and stops with exit code 1. The error starts with the place of the problem in the file:

```
2026-11-13T06:00:00.000Z ERROR accounts[2].token: "XYZ" isn't built in on tron; define it in tokens: stage=config
```

`accounts[2]` is the third account, because the count starts at 0.

These are the errors that you can see most often:

| Error                                                                                   | What to do                                                                  |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `config: can't read /config/config.yml (ENOENT)`                                        | Mount the file at that path, or set `--config` or `CONFIG_FILE`.            |
| `<path>: unknown key; expected ...`                                                     | Correct the spelling of the key. The error lists the correct keys.          |
| `<path>: required`                                                                      | Add the key.                                                                |
| `<path>: environment variable NAME is not set`                                          | Set the variable for the tool, for example in your Secret or env file.      |
| `actual.auth: set one of session, password, api_key`                                    | Add one login method. See [docs/authentication.md](authentication.md).      |
| `actual.auth: set only one of session, password, api_key; found ...`                    | Remove all methods but one.                                                 |
| `actual.auth.<method>: use ${VAR}, never the secret itself`                             | Put the secret in an environment variable, and write `${NAME}` in the file. |
| `prices.currency: "..." isn't an ISO 4217 currency code`                                | Use a 3-letter code, for example `eur`.                                     |
| `prices.currency: "..." isn't supported by ...`                                         | Use another currency, or add a provider that supports it.                   |
| `<path>: unknown explorer "..." for tron; supported: ...`                               | Use one of the listed explorers.                                            |
| `<path>: unknown price provider "..."; supported: ...`                                  | Use one of the listed providers.                                            |
| `accounts[N].token: "..." isn't built in on tron; define it in tokens:`                 | Add the token to `tokens`, or correct the symbol.                           |
| `tokens[N].symbol: "..." is built in on tron; remove it from tokens:`                   | Remove the entry. Accounts can use the built-in token by its symbol.        |
| `accounts[N].token: none of the listed price providers (...) has a price id for ...`    | Add a `price_ids` entry for one of your providers.                          |
| `accounts[N].wallets[0]: not a valid tron address`                                      | Correct the address. The error does not show it.                            |
| `accounts[N].wallets: several wallets per account isn't supported yet (see ROADMAP.md)` | Use one wallet per account. See the [roadmap](../ROADMAP.md).               |
| `accounts[N].name: "..." is already used by accounts[M]`                                | Each account can be in the list one time only.                              |

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
