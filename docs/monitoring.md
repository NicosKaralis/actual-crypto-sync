# Logs, metrics and traces

This page tells you what the tool logs, and which metrics and traces it sends. Use them to monitor the tool, for example with an alert when the sync stops working.

## Logs

The tool writes its logs on standard output, one line per entry. The `LOG_FORMAT` environment variable sets the format:

| `LOG_FORMAT`         | Format                                                            |
| -------------------- | ----------------------------------------------------------------- |
| `text` (the default) | For people: in a terminal, a cron mail or `docker logs`.          |
| `json`               | For log systems, for example VictoriaLogs, Loki or Elasticsearch. |

Any other value is an error: the tool writes one error line in text, and stops with exit code 1.

In both formats, wallet addresses show only in a short form, for example `TC9F...R2MJ`, and secrets never show. With `--debug`, the tool also logs each request: the method, the URL without its query string, the status and the time.

### Text

Each line has the time in UTC, the level, the message, then the fields as `key=value`. A value with a space, a quote or `=` is in quotes:

```
2026-11-13T06:00:02.000Z INFO  created a transaction account="TRON: TRX" amount_cents=4661 value_cents=4661 note="156.9193 TRX (Δ +156.9193 @ 0.297 EUR/TRX, 46.61 EUR)" explorer=trongrid source=coingecko
```

### JSON

With `LOG_FORMAT=json`, each line is one JSON object. It has the same fields as the text line, and also the `trace_id` and `span_id` of the active span, so you can find the trace of a log line:

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
  "source": "coingecko",
  "trace_id": "5b8efff798038103d269b633813fc60c",
  "span_id": "eee19b7ec3c1b174"
}
```

## Metrics and traces

Metrics and traces go to an OpenTelemetry collector or backend over OTLP: `http/protobuf` by default, or `http/json` or `grpc`. Set `OTEL_EXPORTER_OTLP_ENDPOINT`, for example `http://otel-collector:4318`. Without an endpoint, the tool sends nothing. If an export fails, the tool logs a warning, and the run still succeeds.

To connect the tool to your backend (protocols, authentication, TLS, sampling and the other settings), see [Sending metrics and traces](opentelemetry.md).

### Metrics

The tool sets each metric one time per run. All metrics are gauges.

| Metric                                              | Labels                                   | What it is                                                                               |
| --------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `actual_crypto_sync_last_run_timestamp_seconds`     |                                          | When the last run started.                                                               |
| `actual_crypto_sync_last_success_timestamp_seconds` |                                          | When the last run without errors started.                                                |
| `actual_crypto_sync_run_duration_seconds`           |                                          | How long the last run took.                                                              |
| `actual_crypto_sync_balance`                        | `chain`, `symbol`, `account`, `explorer` | The part of the account's balance that each explorer read, in tokens.                    |
| `actual_crypto_sync_account_balance`                | `chain`, `symbol`, `account`             | The balance of the account, in tokens: the total of all its wallets.                     |
| `actual_crypto_sync_price`                          | `symbol`, `currency`, `source`           | The price of one token.                                                                  |
| `actual_crypto_sync_value`                          | `chain`, `symbol`, `account`, `currency` | The value of the account in the currency.                                                |
| `actual_crypto_sync_transactions`                   | `action`                                 | Transactions `created`, `updated`, `cleared` and `deleted`; accounts `skipped`.          |
| `actual_crypto_sync_errors`                         | `stage`                                  | Errors at each stage: `config`, `wallet`, `quotes`, `actual`, `account`.                 |
| `actual_crypto_sync_provider_errors`                | `kind`, `id`                             | Failed requests to each explorer (`kind="explorer"`) or price provider (`kind="price"`). |
| `actual_crypto_sync_build_info`                     | `version`                                | Always 1. The version of the tool that sent the metrics.                                 |

An account with several wallets can have more than one `actual_crypto_sync_balance` series, one for each explorer that read its wallets. Usually one explorer reads all of them, so there is one series. For the total of the account, use `actual_crypto_sync_account_balance` in tokens, or `actual_crypto_sync_value` in the currency. Do not add up `actual_crypto_sync_balance` over the explorers with a query over a time window: when the explorer of a wallet changes between two runs, the window can hold both series, and the wallet counts two times.

`skipped` counts the accounts that the run did not update, because today's sync transaction is reconciled in Actual and the value of the wallet changed. These accounts show the reconciled value until the next day. See [What the tool writes](configuration.md#what-the-tool-writes).

To show the running version on a dashboard, use the `version` label of `actual_crypto_sync_build_info`. Every metric and span also has the version in its scope. See [Resource and scope](opentelemetry.md#resource-the-service-name-and-labels).

An alert on `actual_crypto_sync_last_success_timestamp_seconds` tells you when the sync stops working. For example, alert when it is more than one day old.

### Traces

Each run is one trace, with the root span `actual-crypto-sync.run`. Its child spans are `actual.download`, `wallet <chain> <short address>`, `quotes`, `price <provider>` and `account <name>`, and one span for each HTTP request.

The requests to your Actual server carry the trace ID in a `traceparent` header, so a future Actual version that sends traces can join the trace. The requests to block explorers and price providers never carry it. See [Propagation](opentelemetry.md#propagation).
