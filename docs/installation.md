# Installation

This page tells you how to get the tool, and the ways to run it. To set it up for the first time, follow the [quick start](../README.md#quick-start) first.

## The image

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

To run it from source with Node.js, see [docs/development.md](development.md).

## Ways to run it

The tool syncs your accounts one time and exits, so a scheduler runs it, for example one time each day.

- [Command line](#command-line)
- [Cron](#cron)
- [Docker Compose](#docker-compose)
- [Kubernetes](#kubernetes)

Set `TZ` to your time zone in each of them. The date of the transaction is "today" in that time zone, and the image uses UTC if you do not set it.

### Command line

Run the image with `docker run`, as in the [quick start](../README.md#quick-start), and add the options after the image name:

```sh
docker run --rm --env-file .env -e TZ=Europe/Lisbon \
  -v "$PWD/config.yml:/config/config.yml:ro" \
  ghcr.io/nicoskaralis/actual-crypto-sync:1 --dry-run --debug
```

```
Usage: actual-crypto-sync [--config <path>] [--dry-run] [--debug]

Options:
  --config <path>  Config file (default: $CONFIG_FILE or /config/config.yml)
  --dry-run        Read everything and log the plan, write nothing to Actual
  --debug          Log every request's URL and status
  -h, --help       Show this help
```

The exit code is 0 when all accounts are in line, and 1 when one or more failed. The other accounts are still synced.

### Cron

Any scheduler that can run a command works. For example, a crontab line:

```
0 6 * * * docker run --rm --env-file /srv/actual-crypto-sync/.env -e TZ=Europe/Lisbon -v /srv/actual-crypto-sync/config.yml:/config/config.yml:ro ghcr.io/nicoskaralis/actual-crypto-sync:1
```

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

## Environment variables

| Variable                              | Default              | What it is                                                                                  |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `CONFIG_FILE`                         | `/config/config.yml` | The path of the config file. `--config` overrides it.                                       |
| `ACTUAL_DATA_DIR`                     | `/cache`             | Where the tool keeps its copy of the budget. It must be writable.                           |
| `TZ`                                  | `UTC`                | The time zone that sets the date of "today".                                                |
| `LOG_FORMAT`                          | `text`               | `text` for people, or `json` for log systems. See [docs/monitoring.md](monitoring.md#logs). |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         |                      | The base URL of an OpenTelemetry collector, for traces and metrics.                         |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`  |                      | The full URL for traces only.                                                               |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` |                      | The full URL for metrics only.                                                              |
| `OTEL_EXPORTER_OTLP_TIMEOUT`          | `5000`               | The export timeout in milliseconds.                                                         |

Your config can read other variables with `${NAME}`, for example the secrets and the wallets.

For what the tool sends to the collector, see [docs/monitoring.md](monitoring.md).
