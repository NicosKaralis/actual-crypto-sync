# Sending metrics and traces

The tool can send its metrics and traces to any backend that takes OpenTelemetry (OTLP): an OpenTelemetry Collector, VictoriaMetrics, Jaeger, Grafana Tempo, and others. You configure it with the standard `OTEL_*` environment variables, the same ones that other OpenTelemetry tools use.

This page tells you how to connect the tool to your backend. For the metrics and the spans that the tool sends, see [Logs, metrics and traces](monitoring.md#metrics-and-traces).

- [Quick start](#quick-start)
- [How the tool reads the settings](#how-the-tool-reads-the-settings)
- [Protocols and endpoints](#protocols-and-endpoints)
- [Authentication and TLS](#authentication-and-tls)
- [Compression and timeouts](#compression-and-timeouts)
- [Choose what the tool sends](#choose-what-the-tool-sends)
- [Resource: the service name and labels](#resource-the-service-name-and-labels)
- [Sampling](#sampling)
- [Propagation](#propagation)
- [What the tool does not support](#what-the-tool-does-not-support)
- [Warnings and errors](#warnings-and-errors)
- [All the variables](#all-the-variables)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Quick start

Set one variable, the address of your collector:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

The tool then sends:

- the traces to `http://otel-collector:4318/v1/traces`,
- the metrics to `http://otel-collector:4318/v1/metrics`,
- both as `http/protobuf`, which is the default of the OpenTelemetry specification.

Without an endpoint, the tool sends nothing.

To check that the data arrives, run the tool one time and look for the metric `actual_crypto_sync_last_run_timestamp_seconds` in your backend. If an export fails, the tool logs a warning that starts with `couldn't send the`. See [Troubleshooting](#troubleshooting).

## How the tool reads the settings

Most settings have three variables: a general one, and one for each signal (traces and metrics). The variable for a signal wins over the general one. For example, for the protocol:

| Variable                              | Applies to          |
| ------------------------------------- | ------------------- |
| `OTEL_EXPORTER_OTLP_PROTOCOL`         | Traces and metrics. |
| `OTEL_EXPORTER_OTLP_TRACES_PROTOCOL`  | Traces only.        |
| `OTEL_EXPORTER_OTLP_METRICS_PROTOCOL` | Metrics only.       |

So traces and metrics can go to different backends, with different protocols, headers and timeouts.

An empty variable is the same as a variable that is not set.

The endpoint and the protocol are two separate settings. The endpoint tells the tool where your collector is. The protocol tells the tool how to talk to it. Your backend must accept the protocol that you choose. If it does not, it refuses each export, and the tool logs a warning.

## Protocols and endpoints

The tool supports the three OTLP protocols:

| Protocol                  | What it is                   | Usual port | When to use it                                                                                  |
| ------------------------- | ---------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `http/protobuf` (default) | Protobuf over HTTP.          | 4318       | Most backends. Some, such as VictoriaMetrics, accept only this one.                             |
| `http/json`               | JSON over HTTP.              | 4318       | Only when your backend or a proxy needs JSON.                                                   |
| `grpc`                    | Protobuf over gRPC (HTTP/2). | 4317       | Backends that listen only on gRPC, for example a Collector or Jaeger configured with gRPC only. |

How the tool builds the URL of each export:

| Variable                                                    | `http/protobuf` and `http/json`                          | `grpc`         |
| ----------------------------------------------------------- | -------------------------------------------------------- | -------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                               | A base URL: the tool adds `/v1/traces` or `/v1/metrics`. | Used as it is. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `_METRICS_ENDPOINT` | The full URL, used as it is.                             | Used as it is. |

Examples:

| Settings                                                                                                                              | Traces go to                              | Metrics go to                              |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ |
| `OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318`                                                                                   | `http://collector:4318/v1/traces`         | `http://collector:4318/v1/metrics`         |
| `OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com/otlp`                                                                           | `https://otlp.example.com/otlp/v1/traces` | `https://otlp.example.com/otlp/v1/metrics` |
| `OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318` and `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://vm:8428/opentelemetry/v1/metrics` | `http://collector:4318/v1/traces`         | `http://vm:8428/opentelemetry/v1/metrics`  |
| `OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4317` and `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`                                            | `collector:4317`                          | `collector:4317`                           |

For `grpc`, the endpoint can also be `host:port` without a scheme, for example `collector:4317`. Then the tool uses TLS, unless `OTEL_EXPORTER_OTLP_INSECURE=true`. With `http://` the tool never uses TLS, and with `https://` it always does. A path in a gRPC endpoint has no effect.

An endpoint must be an `http://` or `https://` URL (or `host:port` for gRPC). Anything else is an [error](#warnings-and-errors).

You can mix the protocols. For example, traces over gRPC to Jaeger, and metrics over `http/protobuf` to VictoriaMetrics. See [Examples](#examples).

## Authentication and TLS

### Headers

Hosted backends usually need an API key or a token in a header. Set the headers with `OTEL_EXPORTER_OTLP_HEADERS`, as a comma-separated list of `key=value`:

```sh
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20my-token,X-Scope-OrgID=home
```

- The values are URL-encoded. Write a space as `%20`, a comma as `%2C` and `=` as `%3D`.
- `OTEL_EXPORTER_OTLP_TRACES_HEADERS` and `OTEL_EXPORTER_OTLP_METRICS_HEADERS` add headers for one signal. When a key is in both, the one of the signal wins.
- With `grpc`, the headers are sent as gRPC metadata.

Headers are secrets. The tool never logs them, and never shows them in an error. Keep them out of your config file and your compose file: pass them from a secret, for example a Kubernetes Secret or a Docker Compose `env_file` that is not in git.

### TLS

With an `https://` endpoint, the tool checks the certificate of the collector against the usual public certificate authorities. For a private certificate authority, or for mutual TLS, set the paths of PEM files:

| Variable                                | What it is                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `OTEL_EXPORTER_OTLP_CERTIFICATE`        | The certificate authority that signed the collector's certificate.             |
| `OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE` | The client certificate, for mutual TLS.                                        |
| `OTEL_EXPORTER_OTLP_CLIENT_KEY`         | The private key of the client certificate. Set it with the client certificate. |

Each one also has a `_TRACES_` and a `_METRICS_` variable. In Docker or Kubernetes, mount the files into the container and give their paths. If the tool cannot read a file, it is an [error](#warnings-and-errors).

`OTEL_EXPORTER_OTLP_INSECURE=true` turns TLS off for a gRPC endpoint without a scheme. It has no effect on HTTP endpoints: for those, the scheme (`http://` or `https://`) decides.

## Compression and timeouts

| Variable                         | Values                | Default | What it is                                                     |
| -------------------------------- | --------------------- | ------- | -------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_COMPRESSION` | `gzip`, `none`        | `none`  | Compresses each export. Useful when the collector is far away. |
| `OTEL_EXPORTER_OTLP_TIMEOUT`     | Milliseconds, above 0 | `5000`  | How long the tool waits for each export.                       |

Both also have a `_TRACES_` and a `_METRICS_` variable.

The default timeout is 5 seconds, shorter than the 10 seconds of the specification. The tool runs for a few seconds and then stops. If the collector does not answer, the run still ends soon after the timeout.

## Choose what the tool sends

| Variable                | Values          | Default | What it is                                                    |
| ----------------------- | --------------- | ------- | ------------------------------------------------------------- |
| `OTEL_SDK_DISABLED`     | `true`, `false` | `false` | `true` turns off all telemetry: no export and no propagation. |
| `OTEL_TRACES_EXPORTER`  | `otlp`, `none`  | `otlp`  | `none` turns off the traces.                                  |
| `OTEL_METRICS_EXPORTER` | `otlp`, `none`  | `otlp`  | `none` turns off the metrics.                                 |

For example, to send only the metrics with one shared endpoint:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_TRACES_EXPORTER=none
```

The specification also lists `console`, `zipkin`, `prometheus` and `logging`. The tool does not have these exporters. If you set one, the tool skips it and names it in the [unused variables warning](#warnings-and-errors).

## Resource: the service name and labels

Each metric and each span carries the resource of the tool. By default, the resource has one attribute, `service.name=actual-crypto-sync`. The tool adds no host, process or version attributes, so the series stay the same from one run to the next.

| Variable                   | Example                                       | What it is                                                               |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `OTEL_SERVICE_NAME`        | `crypto-sync-prod`                            | Replaces `service.name`.                                                 |
| `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment=prod,team=home%20lab` | Adds attributes, as a comma-separated list of `key=value` (URL-encoded). |

When `OTEL_SERVICE_NAME` is set, it wins over a `service.name` in `OTEL_RESOURCE_ATTRIBUTES`.

Use these variables to tell two installations apart, for example two budgets. Many backends turn the resource attributes into labels.

> [!WARNING]
> If you change the service name or the attributes, the labels of every metric change. Update your dashboards and your alerts at the same time, or they stop matching the new series.

## Sampling

By default, the tool traces every run. Each run is one trace, so a sampler decides which runs are traced.

| `OTEL_TRACES_SAMPLER`             | What it does                                                  |
| --------------------------------- | ------------------------------------------------------------- |
| `parentbased_always_on` (default) | Traces every run.                                             |
| `always_on`                       | Traces every run.                                             |
| `always_off`                      | Traces no run. The metrics are still sent.                    |
| `traceidratio`                    | Traces a part of the runs: `OTEL_TRACES_SAMPLER_ARG` sets it. |
| `parentbased_always_off`          | Traces no run.                                                |
| `parentbased_traceidratio`        | Like `traceidratio`.                                          |

The tool always starts a new trace, so the `parentbased_` samplers do the same as the ones without the prefix.

`OTEL_TRACES_SAMPLER_ARG` is a number from 0 to 1. For example, if the tool runs every 5 minutes (288 runs each day), this traces about one run in ten:

```sh
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

The specification also lists `jaeger_remote`, `parentbased_jaeger_remote` and `xray`. The tool does not have these samplers. If you set one, the tool uses the default and names it in the [unused variables warning](#warnings-and-errors).

## Propagation

Propagation sends the ID of the current trace with a request, in a header such as `traceparent`. If the server that gets the request also sends traces to your backend, its spans join the trace of the tool.

The tool sends these headers **only to your Actual server**. Block explorers and price providers never get them. They are third-party services that do not send traces to your backend, so the headers would only give them an ID that links your requests together.

Actual does not use OpenTelemetry today, so it ignores the headers. If a future version of Actual sends traces, its spans join the trace of the tool, and you change nothing.

| `OTEL_PROPAGATORS` value | Header                                   |
| ------------------------ | ---------------------------------------- |
| `tracecontext`           | W3C `traceparent` and `tracestate`.      |
| `baggage`                | W3C `baggage`. The tool sets no baggage. |
| `b3`                     | Zipkin B3, one `b3` header.              |
| `b3multi`                | Zipkin B3, several `X-B3-*` headers.     |
| `none`                   | No headers.                              |

The default is `tracecontext,baggage`. To turn propagation off, set `OTEL_PROPAGATORS=none`.

The specification also lists `jaeger`, `xray` and `ottrace`. The tool does not have these propagators. If you set one, the tool skips it and names it in the [unused variables warning](#warnings-and-errors).

## What the tool does not support

| Variables                                                                        | Why                                                                                                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `OTEL_LOGS_EXPORTER`, `OTEL_EXPORTER_OTLP_LOGS_*`, `OTEL_BLRP_*`                 | The tool writes its logs to standard output. Your log collector reads them there; OTLP logs would be duplicates. |
| `OTEL_METRIC_EXPORT_INTERVAL`, `OTEL_METRIC_EXPORT_TIMEOUT`                      | The tool sends the metrics one time, when the run ends.                                                          |
| `OTEL_BSP_*`                                                                     | The tool sends the spans when the run ends.                                                                      |
| `OTEL_ATTRIBUTE_*_LIMIT`, `OTEL_SPAN_*_LIMIT` and the other limits               | The spans of the tool are small, so the default limits apply.                                                    |
| `OTEL_LOG_LEVEL`                                                                 | The tool logs failed exports itself.                                                                             |
| `OTEL_EXPORTER_ZIPKIN_*`, `OTEL_EXPORTER_PROMETHEUS_*`, `OTEL_EXPORTER_JAEGER_*` | The tool exports only over OTLP.                                                                                 |
| `OTEL_METRICS_EXEMPLAR_FILTER`                                                   | The tool records no exemplars.                                                                                   |
| `OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION`                       | The tool checks the value, but it has no effect: the tool has no histograms.                                     |

The tool names each of these in the [unused variables warning](#warnings-and-errors) when you set it.

## Warnings and errors

### Variables that the tool does not use

Some platforms set `OTEL_*` variables for every container. When one is set but the tool does not use it, the tool logs one warning line at the start of each run. The line names each variable and the reason. It also names variables that the tool does not know, such as a typo:

```
2026-11-14T06:00:00.000Z WARN  OTEL variables set but not used (TELEMETRY_IGNORE_UNUSED_ENV=true hides this) stage=config unused="OTEL_BSP_SCHEDULE_DELAY (spans are sent when the run ends), OTEL_LOGS_EXPORTER (logs go to stdout only), OTEL_PROPAGATORS=jaeger (not available)"
```

If you cannot remove these variables, set `TELEMETRY_IGNORE_UNUSED_ENV=true` to hide the warning. It hides only this warning: errors and failed exports still show.

### Invalid values

A value that is not valid is an error. Examples are a typo in a protocol, a sampler ratio that is not a number, or a certificate file that the tool cannot read. By default, the tool logs one error and stops with exit code 1, before it reads the config:

```
2026-11-14T06:00:00.000Z ERROR OTEL_EXPORTER_OTLP_PROTOCOL: use grpc, http/protobuf, http/json, not "http" stage=config
```

The errors never show the value of a header or of an endpoint, because these can hold secrets.

If you cannot change these variables, set `TELEMETRY_DISABLED_ON_ERROR=true`. Then the tool logs the error, turns telemetry off for that run, and still syncs. The exit code then depends only on the sync:

```
2026-11-14T06:00:00.000Z ERROR OTEL_EXPORTER_OTLP_PROTOCOL: use grpc, http/protobuf, http/json, not "http"; telemetry is off for this run stage=config
```

A value that the specification defines but the tool does not have, such as the sampler `xray`, is not an error. The tool uses the default and names it in the unused variables warning.

### Failed exports

When an export fails, the tool logs a warning. The run does not fail, and the exit code does not change:

```
2026-11-14T06:00:05.000Z WARN  couldn't send the metrics to the OpenTelemetry endpoint stage=telemetry signal=metrics protocol=http/protobuf endpoint=http://127.0.0.1:9/v1/metrics error="connect ECONNREFUSED 127.0.0.1:9"
```

The warning shows the endpoint without a user, password or query string, and the reply of the backend if it sent one. It never shows the headers.

## All the variables

The variables of the tool:

| Variable                      | Values          | Default | What it is                                                                                        |
| ----------------------------- | --------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `TELEMETRY_IGNORE_UNUSED_ENV` | `true`, `false` | `false` | Hides the [unused variables warning](#variables-that-the-tool-does-not-use).                      |
| `TELEMETRY_DISABLED_ON_ERROR` | `true`, `false` | `false` | An [invalid value](#invalid-values) turns telemetry off for the run instead of stopping the tool. |

The standard variables. The ones marked "per signal" also have a `_TRACES_` and a `_METRICS_` variable, for example `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`:

| Variable                                                   | Per signal | Values                                                            | Default                 |
| ---------------------------------------------------------- | ---------- | ----------------------------------------------------------------- | ----------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                              | Yes        | A URL ([how it is used](#protocols-and-endpoints))                | None: nothing is sent   |
| `OTEL_EXPORTER_OTLP_PROTOCOL`                              | Yes        | `http/protobuf`, `http/json`, `grpc`                              | `http/protobuf`         |
| `OTEL_EXPORTER_OTLP_HEADERS`                               | Yes        | `key=value,key=value`, URL-encoded                                | None                    |
| `OTEL_EXPORTER_OTLP_TIMEOUT`                               | Yes        | Milliseconds, above 0                                             | `5000`                  |
| `OTEL_EXPORTER_OTLP_COMPRESSION`                           | Yes        | `gzip`, `none`                                                    | `none`                  |
| `OTEL_EXPORTER_OTLP_CERTIFICATE`                           | Yes        | Path of a PEM file                                                | The public authorities  |
| `OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE`                    | Yes        | Path of a PEM file                                                | None                    |
| `OTEL_EXPORTER_OTLP_CLIENT_KEY`                            | Yes        | Path of a PEM file                                                | None                    |
| `OTEL_EXPORTER_OTLP_INSECURE`                              | Yes        | `true`, `false` (gRPC only)                                       | `false`                 |
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE`        | No         | `cumulative`, `delta`, `lowmemory`                                | `cumulative`            |
| `OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION` | No         | `explicit_bucket_histogram`, `base2_exponential_bucket_histogram` | No effect               |
| `OTEL_SDK_DISABLED`                                        | No         | `true`, `false`                                                   | `false`                 |
| `OTEL_TRACES_EXPORTER`                                     | No         | `otlp`, `none`                                                    | `otlp`                  |
| `OTEL_METRICS_EXPORTER`                                    | No         | `otlp`, `none`                                                    | `otlp`                  |
| `OTEL_SERVICE_NAME`                                        | No         | Any text                                                          | `actual-crypto-sync`    |
| `OTEL_RESOURCE_ATTRIBUTES`                                 | No         | `key=value,key=value`, URL-encoded                                | None                    |
| `OTEL_TRACES_SAMPLER`                                      | No         | See [Sampling](#sampling)                                         | `parentbased_always_on` |
| `OTEL_TRACES_SAMPLER_ARG`                                  | No         | A number from 0 to 1                                              | `1`                     |
| `OTEL_PROPAGATORS`                                         | No         | `tracecontext`, `baggage`, `b3`, `b3multi`, `none`                | `tracecontext,baggage`  |

The values are not case-sensitive, except the endpoints, the headers, the file paths and the resource.

## Examples

Each example shows the environment of the tool in Docker Compose. The end-to-end tests of the tool check the VictoriaMetrics and Jaeger examples.

### OpenTelemetry Collector over HTTP

```yaml
environment:
  OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
```

### OpenTelemetry Collector over gRPC

```yaml
environment:
  OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317
  OTEL_EXPORTER_OTLP_PROTOCOL: grpc
```

### VictoriaMetrics for metrics, Jaeger for traces

VictoriaMetrics takes OTLP metrics as protobuf only, on the path `/opentelemetry/v1/metrics`. Jaeger takes OTLP traces over gRPC on port 4317.

```yaml
environment:
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: http://victoriametrics:8428/opentelemetry/v1/metrics
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: http://jaeger:4317
  OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: grpc
```

VictoriaMetrics keeps the resource attributes as labels, so the metrics have the label `service.name="actual-crypto-sync"`.

### A hosted backend with an API key

```yaml
environment:
  OTEL_EXPORTER_OTLP_ENDPOINT: https://otlp.example.com/otlp
  OTEL_EXPORTER_OTLP_COMPRESSION: gzip
env_file:
  # Holds OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20<your token>.
  # Keep this file out of git.
  - otel-secrets.env
```

Your backend's documentation gives the endpoint and the header to use.

### Two installations, told apart

```yaml
environment:
  OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
  OTEL_SERVICE_NAME: crypto-sync-family
  OTEL_RESOURCE_ATTRIBUTES: deployment.environment=prod
```

## Troubleshooting

| What you see                                                   | Why                                                                                                      | What to do                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A warning with `json encoding isn't supported` or `(HTTP 415)` | The backend does not take `http/json`.                                                                   | Remove `*_PROTOCOL=http/json`, or set `http/protobuf`.                                                      |
| A warning with `(HTTP 404)`                                    | The URL is wrong. Often the base URL already ends with `/v1/metrics`, so the tool adds it a second time. | Give the base URL in `OTEL_EXPORTER_OTLP_ENDPOINT`, or the full URL in the `_TRACES_`/`_METRICS_` variable. |
| A warning with `(HTTP 401)` or `(HTTP 403)`                    | The backend refuses the credentials.                                                                     | Check `OTEL_EXPORTER_OTLP_HEADERS`, and that the values are URL-encoded.                                    |
| A warning about gRPC or HTTP/2, or an HTTP export to port 4317 | The protocol does not match the port: 4317 is for gRPC, 4318 for HTTP.                                   | Set the protocol that matches the port, or change the port.                                                 |
| A warning with `certificate` or `self-signed`                  | The tool does not trust the certificate of the collector.                                                | Set `OTEL_EXPORTER_OTLP_CERTIFICATE` to the certificate authority.                                          |
| A warning with `ECONNREFUSED`, `ENOTFOUND` or `timed out`      | The tool cannot reach the collector.                                                                     | Check the host name, the port and the network between the containers.                                       |
| No warning, but no data                                        | No endpoint is set, `OTEL_SDK_DISABLED=true`, an exporter is `none`, or the sampler drops the traces.    | Check these variables. The unused variables warning shows a variable with a typo.                           |
