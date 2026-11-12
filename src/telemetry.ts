// Traces and metrics over OTLP/HTTP. Each exporter exists only when its endpoint
// env is set, so a run with neither sends nothing. Exports time out after
// OTEL_EXPORTER_OTLP_TIMEOUT (5 s by default), so a telemetry endpoint that's
// down never holds up a run for long.

import { context, type Gauge, type Tracer } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
} from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';

import { redactUrl } from './format.ts';

export const SERVICE_NAME = 'actual-crypto-sync';

const DEFAULT_EXPORT_TIMEOUT_MS = 5000;

/** The gauges, all set once per run. Names and labels are public: alerts use them. */
const GAUGES = {
  lastRun: 'actual_crypto_sync_last_run_timestamp_seconds',
  lastSuccess: 'actual_crypto_sync_last_success_timestamp_seconds',
  runDuration: 'actual_crypto_sync_run_duration_seconds',
  balance: 'actual_crypto_sync_balance', // {chain, symbol, account, explorer}
  price: 'actual_crypto_sync_price', // {symbol, currency, source}
  value: 'actual_crypto_sync_value', // {chain, symbol, account, currency}
  transactions: 'actual_crypto_sync_transactions', // {action}
  errors: 'actual_crypto_sync_errors', // {stage}
  providerErrors: 'actual_crypto_sync_provider_errors', // {kind, id}
} as const;

export type GaugeName = keyof typeof GAUGES;

export interface Telemetry {
  tracer: Tracer;
  gauges: Record<GaugeName, Gauge>;
  /** Flushes and stops the exporters. */
  shutdown(): Promise<void>;
}

// The context manager is global and lives as long as the process: it's what
// makes a span active across awaits, for child spans and the logs' trace_id.
let contextManager: AsyncLocalStorageContextManager | undefined;

/**
 * Starts tracing and metrics. Tests pass in-memory exporters; otherwise the
 * OTLP ones are used when OTEL_EXPORTER_OTLP_TRACES_ENDPOINT and
 * OTEL_EXPORTER_OTLP_METRICS_ENDPOINT are set. `instrumentFetch` adds a span
 * for every request, with wallet addresses in its URL shortened.
 */
export function startTelemetry({
  env,
  spanExporter,
  metricExporter,
  instrumentFetch = true,
}: {
  env: Record<string, string | undefined>;
  spanExporter?: SpanExporter;
  metricExporter?: PushMetricExporter;
  instrumentFetch?: boolean;
}): Telemetry {
  if (contextManager === undefined) {
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
  }

  const timeoutMillis = exportTimeout(env.OTEL_EXPORTER_OTLP_TIMEOUT);
  // Only service.name: no host, process or SDK version, so series don't change between runs.
  const resource = resourceFromAttributes({ 'service.name': SERVICE_NAME });

  const spanProcessors: SpanProcessor[] = [];
  if (spanExporter) {
    spanProcessors.push(new SimpleSpanProcessor({ exporter: spanExporter }));
  } else if (env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    spanProcessors.push(
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter({
          url: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
          timeoutMillis,
        }),
        exportTimeoutMillis: timeoutMillis,
      }),
    );
  }
  const tracerProvider = new TracerProvider({ resource, spanProcessors });

  const metricsExporter =
    metricExporter ??
    (env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
      ? new OTLPMetricExporter({ url: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT, timeoutMillis })
      : undefined);
  const meterProvider = new MeterProvider({
    resource,
    readers: metricsExporter
      ? [
          // Gauges are set once at the end of a run and exported once, on shutdown.
          new PeriodicExportingMetricReader({
            exporter: metricsExporter,
            exportIntervalMillis: 24 * 60 * 60 * 1000,
            exportTimeoutMillis: timeoutMillis,
          }),
        ]
      : [],
  });
  const meter = meterProvider.getMeter(SERVICE_NAME);
  const gauges = Object.fromEntries(
    Object.entries(GAUGES).map(([key, name]) => [key, meter.createGauge(name)]),
  ) as Record<GaugeName, Gauge>;

  let fetchInstrumentation: UndiciInstrumentation | undefined;
  if (instrumentFetch) {
    // No meter provider: the instrumentation's request histogram isn't one of ours.
    fetchInstrumentation = new UndiciInstrumentation({
      // Replaces the URL attributes, which hold wallet addresses and query strings.
      startSpanHook: (request) => {
        const url = redactUrl(`${request.origin}${request.path}`);
        return {
          'url.full': url,
          'url.path': url === '(invalid URL)' ? url : new URL(url).pathname,
          'url.query': '',
        };
      },
    });
    fetchInstrumentation.setTracerProvider(tracerProvider);
  }

  return {
    tracer: tracerProvider.getTracer(SERVICE_NAME),
    gauges,
    shutdown: async () => {
      fetchInstrumentation?.disable();
      await Promise.allSettled([tracerProvider.shutdown(), meterProvider.shutdown()]);
    },
  };
}

function exportTimeout(value: string | undefined): number {
  const ms = Number(value);
  return value !== undefined && Number.isInteger(ms) && ms > 0 ? ms : DEFAULT_EXPORT_TIMEOUT_MS;
}
