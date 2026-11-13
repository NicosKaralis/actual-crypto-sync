# Logs, metrics and traces

This page tells you what the tool logs, and which metrics and traces it sends. Use them to monitor the tool, for example with an alert when the sync stops working.

## Logs

Logs are JSON, one line per entry, on standard output. With `--debug`, the tool also logs each request: the method, the URL without its query string, the status and the time. Wallet addresses show only in a short form, for example `TC9F...R2MJ`. Secrets never show.

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
| `actual_crypto_sync_transactions`                   | `action`                                 | Transactions `created`, `updated`, `cleared` and `deleted`.                              |
| `actual_crypto_sync_errors`                         | `stage`                                  | Errors at each stage: `config`, `wallet`, `quotes`, `actual`, `account`.                 |
| `actual_crypto_sync_provider_errors`                | `kind`, `id`                             | Failed requests to each explorer (`kind="explorer"`) or price provider (`kind="price"`). |

An alert on `actual_crypto_sync_last_success_timestamp_seconds` tells you when the sync stops working. For example, alert when it is more than one day old.

### Traces

Each run is one trace, with the root span `actual-crypto-sync.run`. Its child spans are `actual.download`, `wallet <chain> <short address>`, `quotes`, `price <provider>` and `account <name>`, and one span for each HTTP request.
