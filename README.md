<h1 align="center">actual-crypto-sync</h1>

<p align="center">
  Keeps off-budget <a href="https://actualbudget.org">Actual Budget</a> accounts in line with the value of your crypto wallets.
</p>

<p align="center">
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/actions/workflows/ci.yml"><img src="https://github.com/NicosKaralis/actual-crypto-sync/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/releases/latest"><img src="https://img.shields.io/github/v/release/NicosKaralis/actual-crypto-sync?sort=semver" alt="Latest release" /></a>
  <a href="https://github.com/NicosKaralis/actual-crypto-sync/pkgs/container/actual-crypto-sync"><img src="https://img.shields.io/badge/image-ghcr.io-blue?logo=docker&logoColor=white" alt="Docker image on GHCR" /></a>
  <a href="https://actualbudget.org"><img src="https://img.shields.io/badge/Actual-26.11.0-8719e0" alt="Actual server 26.11.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/NicosKaralis/actual-crypto-sync" alt="MIT license" /></a>
</p>

## Getting Started

actual-crypto-sync is a command-line tool. It is free and open source, and it is written in TypeScript for Node.js. Each run does these steps:

1. It reads the balance of each wallet from a block explorer.
2. It reads the current price of each token from a price provider.
3. It writes one adjustment transaction per account per day, so the account shows what the wallet is worth.

The note of each transaction shows the balance, the change since the last run and the price, for example:

```
156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.6 EUR)
```

The tool runs once and exits. Run it on a schedule, for example with cron or a Kubernetes CronJob. [What the tool writes](docs/configuration.md#what-the-tool-writes) tells you more about the transactions.

If you want to contribute, read [CONTRIBUTING.md](CONTRIBUTING.md). We would love to have you.

Want to say thanks? Click the ⭐ at the top of the page.

## Key Links

- [Configuration](docs/configuration.md): each setting, and the errors that you can see.
- [Authentication](docs/authentication.md): how the tool logs in to Actual.
- [Development](docs/development.md): set up the project, test it, and add a chain, explorer, price provider or token.
- [Discussions](https://github.com/NicosKaralis/actual-crypto-sync/discussions/categories/q-a) for questions.
- [Issues](https://github.com/NicosKaralis/actual-crypto-sync/issues/new/choose) for bugs and requests.
- [Roadmap](ROADMAP.md) for what can come next.
- [Actual Budget documentation](https://actualbudget.org/docs).

## Supported

| Chain   | Id        | Tokens                    | Block explorers                                                                              |
| ------- | --------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| TRON    | `tron`    | TRX, and all TRC20 tokens | [TronGrid](https://www.trongrid.io) (`trongrid`)                                             |
| Bitcoin | `bitcoin` | BTC                       | [mempool.space](https://mempool.space) (`mempool-space`), or any mempool or Esplora instance |

| Price provider                         | Id          | Currencies                                              |
| -------------------------------------- | ----------- | ------------------------------------------------------- |
| [CoinGecko](https://www.coingecko.com) | `coingecko` | Most fiat currencies, for example EUR, USD, GBP and JPY |

These tokens are built in. A config uses them by their symbol only. A config can [add other tokens](docs/configuration.md#tokens), for example any TRC20 token.

| Chain   | Symbol | Kind             | Contract                             |
| ------- | ------ | ---------------- | ------------------------------------ |
| TRON    | TRX    | Native           |                                      |
| TRON    | USDT   | Contract (TRC20) | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` |
| Bitcoin | BTC    | Native           |                                      |

The code lets contributors add more chains, block explorers, price providers and tokens. The [roadmap](ROADMAP.md) shows what can come next.

## Before You Use It

- This project is not affiliated with Actual Budget.
- It is not financial advice.
- It writes to your budget. Back up your budget first, and start with `--dry-run`. With `--dry-run`, the tool shows what it will do and writes nothing.
- It is tested with Actual server **26.11.0**. Other versions can work, but they are not tested.

## Installation

The tool is a Docker image on GitHub Container Registry, for amd64 and arm64:

```
ghcr.io/nicoskaralis/actual-crypto-sync:1
```

Each release has these tags:

| Tag            | Points to                                                |
| -------------- | -------------------------------------------------------- |
| `1`            | The latest 1.x.x version.                                |
| `1.0`          | The latest 1.0.x version, so only bug fixes.             |
| `1.0.0`        | Exactly this version.                                    |
| `sha-<commit>` | The image built from that commit.                        |
| `latest`       | The latest version. Use a version tag instead, as above. |

Use a full version, for example `1.0.0`, to update only when you choose.

To run it from source with Node.js, see [docs/development.md](docs/development.md).

### Quick start

1. **Back up your budget.** In Actual, open **Settings**, then **Export data**.
2. **Create the accounts.** In Actual, create one off-budget account for each token of each wallet. For example, a TRON wallet with TRX and USDT needs two accounts: `TRON: TRX` and `TRON: USDT`.
3. **Choose a login method and get its secret.** For most servers, use a session token of a dedicated user. [docs/authentication.md](docs/authentication.md) tells you how.

   | Your server                            | Method                  |
   | -------------------------------------- | ----------------------- |
   | One user, password login               | `password` or `session` |
   | OpenID, or more than one user          | `session`               |
   | A server with API keys (after 26.11.0) | `api_key`               |

4. **Write the config.** Copy [`config.example.yml`](config.example.yml) to `config.yml`, and change it for your server, accounts and wallets. [docs/configuration.md](docs/configuration.md) tells you about each setting.
5. **Write the secrets in an env file**, for example `.env`:

   ```sh
   ACTUAL_BUDGET_SYNC_ID=...
   ACTUAL_SESSION_TOKEN=...
   TRON_WALLET_ADDRESS=TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ
   BTC_ADDRESS=bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v
   ```

6. **Run it one time with `--dry-run`.** The tool reads everything and logs the transactions that it would write:

   ```sh
   docker run --rm --env-file .env -e TZ=Europe/Lisbon \
     -v "$PWD/config.yml:/config/config.yml:ro" \
     ghcr.io/nicoskaralis/actual-crypto-sync:1 --dry-run
   ```

   The container must reach `actual.server_url`. If Actual runs in Docker on the same computer, add `--network` with the network of Actual.

7. **Run it without `--dry-run`**, and check the transactions in Actual.
8. **Run it on a schedule**, for example one time each day. See the examples below.

Set `TZ` to your time zone. The date of the transaction is "today" in that time zone, and the image uses UTC if you do not set it.

### Kubernetes

A CronJob, with the config in a ConfigMap and the secrets in a Secret:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: actual-crypto-sync
data:
  config.yml: |
    actual:
      server_url: http://actual.actual.svc.cluster.local:5006
      sync_id: ${ACTUAL_BUDGET_SYNC_ID}
      auth:
        session: ${ACTUAL_SESSION_TOKEN}
    prices:
      currency: eur
      providers: coingecko
    accounts:
      - name: "TRON: TRX"
        chain: tron
        token: TRX
        wallets: ${TRON_WALLET_ADDRESS}
      - name: "TRON: USDT"
        chain: tron
        token: USDT
        wallets: ${TRON_WALLET_ADDRESS}
---
apiVersion: v1
kind: Secret
metadata:
  name: actual-crypto-sync
stringData:
  ACTUAL_BUDGET_SYNC_ID: "..."
  ACTUAL_SESSION_TOKEN: "..."
  TRON_WALLET_ADDRESS: TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: actual-crypto-sync
spec:
  schedule: "0 6 * * *"
  timeZone: Europe/Lisbon
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      backoffLimit: 0
      template:
        spec:
          restartPolicy: Never
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            runAsGroup: 1000
          containers:
            - name: actual-crypto-sync
              image: ghcr.io/nicoskaralis/actual-crypto-sync:1
              env:
                - name: TZ
                  value: Europe/Lisbon
              envFrom:
                - secretRef:
                    name: actual-crypto-sync
              securityContext:
                allowPrivilegeEscalation: false
                capabilities:
                  drop: [ALL]
              volumeMounts:
                - name: config
                  mountPath: /config
                  readOnly: true
                - name: cache
                  mountPath: /cache
          volumes:
            - name: config
              configMap:
                name: actual-crypto-sync
            - name: cache
              emptyDir: {}
```

The tool downloads the budget again on each run, so `/cache` can be an `emptyDir`.

### Docker Compose

With [Ofelia](https://github.com/mcuadros/ofelia) as the scheduler. Ofelia starts the `actual-crypto-sync` container at each scheduled time:

```yaml
services:
  actual-crypto-sync:
    image: ghcr.io/nicoskaralis/actual-crypto-sync:1
    container_name: actual-crypto-sync
    restart: "no"
    env_file: .env
    environment:
      TZ: Europe/Lisbon
    volumes:
      - ./config.yml:/config/config.yml:ro

  ofelia:
    image: mcuadros/ofelia:0.3.22
    command: daemon --docker
    restart: unless-stopped
    depends_on:
      - actual-crypto-sync
    environment:
      TZ: Europe/Lisbon
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    labels:
      # Ofelia's schedule has seconds first: 06:00 each day.
      ofelia.job-run.actual-crypto-sync.schedule: "0 0 6 * * *"
      ofelia.job-run.actual-crypto-sync.container: actual-crypto-sync
```

- `docker compose up -d` also runs the sync one time, when it creates the container.
- The secrets stay in `.env`, not in the labels.
- Ofelia needs the Docker socket to start the container. That gives Ofelia control of Docker on the host.
- If Actual runs in the same Compose project, set `server_url` to its service name, for example `http://actual:5006`.

### With cron

Any scheduler that can run a command works. For example, a crontab line:

```
0 6 * * * docker run --rm --env-file /srv/actual-crypto-sync/.env -e TZ=Europe/Lisbon -v /srv/actual-crypto-sync/config.yml:/config/config.yml:ro ghcr.io/nicoskaralis/actual-crypto-sync:1
```

### Command line

```
Usage: actual-crypto-sync [--config <path>] [--dry-run] [--debug]

Options:
  --config <path>  Config file (default: $CONFIG_FILE or /config/config.yml)
  --dry-run        Read everything and log the plan, write nothing to Actual
  --debug          Log every request's URL and status
  -h, --help       Show this help
```

The exit code is 0 when all accounts are in line, and 1 when one or more failed. The other accounts are still synced.

### Environment variables

| Variable                              | Default              | What it is                                                          |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `CONFIG_FILE`                         | `/config/config.yml` | The path of the config file. `--config` overrides it.               |
| `ACTUAL_DATA_DIR`                     | `/cache`             | Where the tool keeps its copy of the budget. It must be writable.   |
| `TZ`                                  | `UTC`                | The time zone that sets the date of "today".                        |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         |                      | The base URL of an OpenTelemetry collector, for traces and metrics. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  |                      | The full URL for traces only.                                       |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` |                      | The full URL for metrics only.                                      |
| `OTEL_EXPORTER_OTLP_TIMEOUT`          | `5000`               | The export timeout in milliseconds.                                 |

Your config can read other variables with `${NAME}`, for example the secrets and the wallets.

## Logs, Metrics and Traces

**Logs** are JSON, one line per entry, on standard output. With `--debug`, the tool also logs each request: the method, the URL without its query string, the status and the time. Wallet addresses show only in a short form, for example `TC9F...R2MJ`. Secrets never show.

```json
{
  "time": "2026-11-13T06:00:02.000Z",
  "level": "info",
  "msg": "created a transaction",
  "account": "TRON: TRX",
  "amount_cents": 4661,
  "value_cents": 4661,
  "note": "156.9193 TRX (Δ +156.9193 @ 0.297 EUR/TRX, 46.61 EUR)",
  "explorer": "trongrid",
  "source": "coingecko"
}
```

**Metrics and traces** go to an OpenTelemetry collector over OTLP/HTTP. Set `OTEL_EXPORTER_OTLP_ENDPOINT`, for example `http://otel-collector:4318`. Without an endpoint, the tool sends nothing. If the collector does not answer, the run still succeeds, and the export stops after the timeout.

The tool sets each metric one time per run. All metrics are gauges.

| Metric                                              | Labels                                   | What it is                                                                               |
| --------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `actual_crypto_sync_last_run_timestamp_seconds`     |                                          | When the last run started.                                                               |
| `actual_crypto_sync_last_success_timestamp_seconds` |                                          | When the last run without errors started.                                                |
| `actual_crypto_sync_run_duration_seconds`           |                                          | How long the last run took.                                                              |
| `actual_crypto_sync_balance`                        | `chain`, `symbol`, `account`, `explorer` | The balance of the wallet, in tokens.                                                    |
| `actual_crypto_sync_price`                          | `symbol`, `currency`, `source`           | The price of one token.                                                                  |
| `actual_crypto_sync_value`                          | `chain`, `symbol`, `account`, `currency` | The value of the wallet in the currency.                                                 |
| `actual_crypto_sync_transactions`                   | `action`                                 | Transactions `created`, `updated`, `cleared` and `deleted`.                              |
| `actual_crypto_sync_errors`                         | `stage`                                  | Errors at each stage: `config`, `wallet`, `quotes`, `actual`, `account`.                 |
| `actual_crypto_sync_provider_errors`                | `kind`, `id`                             | Failed requests to each explorer (`kind="explorer"`) or price provider (`kind="price"`). |

An alert on `actual_crypto_sync_last_success_timestamp_seconds` tells you when the sync stops working. For example, alert when it is more than one day old.

Each run is one trace, with the root span `actual-crypto-sync.run`. Its child spans are `actual.download`, `wallet <chain> <short address>`, `quotes`, `price <provider>` and `account <name>`, and one span for each HTTP request.

## Getting Help

- **A question:** ask in [Discussions](https://github.com/NicosKaralis/actual-crypto-sync/discussions/categories/q-a).
- **A bug, or a request for a new chain, explorer, price provider or token:** open an [issue](https://github.com/NicosKaralis/actual-crypto-sync/issues/new/choose) with the related form.
- **A security issue:** do not open a public issue. Read [SECURITY.md](SECURITY.md).

**Do not put API keys, passwords, session tokens or full wallet addresses in an issue or a discussion.** A short address, for example `TC9F...R2MJ`, is sufficient.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you start. [CODE_REVIEW_GUIDELINES.md](CODE_REVIEW_GUIDELINES.md) tells you what a reviewer checks in a pull request. All commits use [Conventional Commits](https://www.conventionalcommits.org), because the changelog and the versions come from them.

All participants must follow the [Code of Conduct](CODE_OF_CONDUCT.md).

### Key files

- [`config.example.yml`](config.example.yml): an example config, with an explanation of each setting.
- [`src/tokens.yml`](src/tokens.yml): the built-in tokens. To add a token, add it here.
- [`src/chains/`](src/chains): one folder per chain, with its block explorers.
- [`src/prices/`](src/prices): one file per price provider.
- [`src/actual.ts`](src/actual.ts): reads and writes the budget through `@actual-app/api`.

### Feature Requests

To ask for a new chain, block explorer, price provider or token, open an [issue](https://github.com/NicosKaralis/actual-crypto-sync/issues/new/choose) with the related form. To show that you want an existing request, add a 👍 reaction to its first comment.

## AI Use

This project is built with a lot of help from AI, mostly Claude Code, and AI-assisted contributions are welcome. See [AI, Claude Code and other agents](CONTRIBUTING.md#ai-claude-code-and-other-agents) for what that means.

## License

[MIT](LICENSE)
