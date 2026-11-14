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

Metrics and traces go to an OpenTelemetry collector over OTLP/HTTP. Set `OTEL_EXPORTER_OTLP_ENDPOINT`, for example `http://otel-collector:4318`. Without an endpoint, the tool sends nothing. If the collector does not answer, the run still succeeds, and the export stops after the timeout.

### Metrics

The tool sets each metric one time per run. All metrics are gauges.

| Metric                                              | Labels                                   | What it is                                                                               |
| --------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `actual_crypto_sync_last_run_timestamp_seconds`     |                                          | When the last run started.                                                               |
| `actual_crypto_sync_last_success_timestamp_seconds` |                                          | When the last run without errors started.                                                |
| `actual_crypto_sync_run_duration_seconds`           |                                          | How long the last run took.                                                              |
| `actual_crypto_sync_balance`                        | `chain`, `symbol`, `account`, `explorer` | The balance of the wallet, in tokens.                                                    |
| `actual_crypto_sync_price`                          | `symbol`, `currency`, `source`           | The price of one token.                                                                  |
| `actual_crypto_sync_value`                          | `chain`, `symbol`, `account`, `currency` | The value of the wallet in the currency.                                                 |
| `actual_crypto_sync_transactions`                   | `action`                                 | Transactions `created`, `updated`, `cleared` and `deleted`; accounts `skipped`.          |
| `actual_crypto_sync_errors`                         | `stage`                                  | Errors at each stage: `config`, `wallet`, `quotes`, `actual`, `account`.                 |
| `actual_crypto_sync_provider_errors`                | `kind`, `id`                             | Failed requests to each explorer (`kind="explorer"`) or price provider (`kind="price"`). |

`skipped` counts the accounts that the run did not update, because today's sync transaction is reconciled in Actual and the value of the wallet changed. These accounts show the reconciled value until the next day. See [What the tool writes](configuration.md#what-the-tool-writes).

An alert on `actual_crypto_sync_last_success_timestamp_seconds` tells you when the sync stops working. For example, alert when it is more than one day old.

### Traces

Each run is one trace, with the root span `actual-crypto-sync.run`. Its child spans are `actual.download`, `wallet <chain> <short address>`, `quotes`, `price <provider>` and `account <name>`, and one span for each HTTP request.
