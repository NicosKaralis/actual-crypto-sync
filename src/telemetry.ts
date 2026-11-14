// Traces and metrics over OTLP, with the settings from otel-env.ts. Each
// exporter exists only when an endpoint is set for it, so a run with none
// sends nothing. Exports time out (5 s by default), so a telemetry endpoint
// that's down never holds up a run for long, and a failed export is a warning,
// never a failed run.

import { credentials as grpcCredentials, Metadata } from '@grpc/grpc-js';
import {
  type Context,
  context,
  type Gauge,
  propagation,
  type Span,
  type TextMapPropagator,
  type TextMapSetter,
  type Tracer,
  trace,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  ExportResultCode,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPMetricExporter as GrpcMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import {
  AggregationTemporalityPreference,
  OTLPMetricExporter as JsonMetricExporter,
} from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPMetricExporter as ProtoMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter as GrpcTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as JsonTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as ProtoTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { B3InjectEncoding, B3Propagator } from '@opentelemetry/propagator-b3';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
} from '@opentelemetry/sdk-metrics';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  type Sampler,
  SimpleSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
  TraceIdRatioBasedSampler,
  TracerProvider,
} from '@opentelemetry/sdk-trace';

import { redactUrl } from './format.ts';
import type { Log } from './log.ts';
import {
  type ExporterSettings,
  type OtelSettings,
  type PropagatorName,
  type SamplerName,
  SERVICE_NAME,
  type Signal,
  TELEMETRY_OFF,
} from './otel-env.ts';

export { SERVICE_NAME };

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
  /** Requests to this URL's origin (the Actual server) get the propagation headers. */
  propagateTo(url: string): void;
  /** Flushes and stops the exporters. */
  shutdown(): Promise<void>;
}

// The context manager is global and lives as long as the process: it's what
// makes a span active across awaits, for child spans and the logs' trace_id.
let contextManager: AsyncLocalStorageContextManager | undefined;

/**
 * The global propagator, registered once like the context manager. It injects
 * only for spans marked as requests to the Actual server, so explorers and
 * price providers never get trace headers; each startTelemetry sets its inner
 * propagator and marked spans.
 */
class ActualOnlyPropagator implements TextMapPropagator {
  inner: TextMapPropagator | undefined;
  marked = new WeakSet<Span>();

  inject(ctx: Context, carrier: unknown, setter: TextMapSetter): void {
    const span = trace.getSpan(ctx);
    if (this.inner && span && this.marked.has(span)) {
      this.inner.inject(ctx, carrier, setter);
    }
  }

  // The tool receives no requests, so there's nothing to extract.
  extract(ctx: Context): Context {
    return ctx;
  }

  fields(): string[] {
    return this.inner?.fields() ?? [];
  }
}
let propagator: ActualOnlyPropagator | undefined;

/**
 * Starts tracing and metrics. Tests pass in-memory exporters; otherwise the
 * OTLP ones are used for each signal with settings. `instrumentFetch` adds a
 * span for every request, with wallet addresses in its URL shortened. `log`
 * gets a warning for each failed export.
 */
export function startTelemetry({
  settings = TELEMETRY_OFF,
  spanExporter,
  metricExporter,
  instrumentFetch = true,
  log = () => {},
}: {
  settings?: OtelSettings;
  spanExporter?: SpanExporter;
  metricExporter?: PushMetricExporter;
  instrumentFetch?: boolean;
  log?: Log;
}): Telemetry {
  if (contextManager === undefined) {
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
  }
  if (propagator === undefined) {
    propagator = new ActualOnlyPropagator();
    propagation.setGlobalPropagator(propagator);
  }
  const marked = new WeakSet<Span>();
  propagator.inner = innerPropagator(settings.propagators);
  propagator.marked = marked;
  let actualOrigin: string | undefined;

  const resource = resourceFromAttributes(settings.resource);

  const spanProcessors: SpanProcessor[] = [];
  if (spanExporter) {
    spanProcessors.push(new SimpleSpanProcessor({ exporter: spanExporter }));
  } else if (settings.traces) {
    spanProcessors.push(
      new BatchSpanProcessor({
        exporter: reportFailures(traceExporter(settings.traces), settings.traces, 'traces', log),
        exportTimeoutMillis: settings.traces.timeoutMillis,
      }),
    );
  }
  const tracerProvider = new TracerProvider({
    resource,
    sampler: sampler(settings.sampler),
    spanProcessors,
  });

  const metricsExporter =
    metricExporter ??
    (settings.metrics
      ? reportFailures(
          metricsOtlpExporter(settings.metrics, settings.temporality),
          settings.metrics,
          'metrics',
          log,
        )
      : undefined);
  const meterProvider = new MeterProvider({
    resource,
    readers: metricsExporter
      ? [
          // Gauges are set once at the end of a run and exported once, on shutdown.
          new PeriodicExportingMetricReader({
            exporter: metricsExporter,
            exportIntervalMillis: 24 * 60 * 60 * 1000,
            exportTimeoutMillis: settings.metrics?.timeoutMillis ?? 5000,
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
      // Runs before the propagation headers are injected.
      requestHook: (span, request) => {
        if (actualOrigin !== undefined && originOf(request.origin) === actualOrigin) {
          marked.add(span);
        }
      },
    });
    fetchInstrumentation.setTracerProvider(tracerProvider);
  }

  return {
    tracer: tracerProvider.getTracer(SERVICE_NAME),
    gauges,
    propagateTo: (url) => {
      actualOrigin = originOf(url);
    },
    shutdown: async () => {
      fetchInstrumentation?.disable();
      await Promise.allSettled([tracerProvider.shutdown(), meterProvider.shutdown()]);
    },
  };
}

function originOf(url: string | URL): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function innerPropagator(names: PropagatorName[]): TextMapPropagator | undefined {
  const create: Record<PropagatorName, () => TextMapPropagator> = {
    tracecontext: () => new W3CTraceContextPropagator(),
    baggage: () => new W3CBaggagePropagator(),
    b3: () => new B3Propagator({ injectEncoding: B3InjectEncoding.SINGLE_HEADER }),
    b3multi: () => new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
  };
  const propagators = names.map((name) => create[name]());
  return propagators.length > 0 ? new CompositePropagator({ propagators }) : undefined;
}

function sampler({ name, ratio }: OtelSettings['sampler']): Sampler {
  const root: Record<SamplerName, () => Sampler> = {
    always_on: () => new AlwaysOnSampler(),
    always_off: () => new AlwaysOffSampler(),
    traceidratio: () => new TraceIdRatioBasedSampler(ratio),
    parentbased_always_on: () => new ParentBasedSampler({ root: new AlwaysOnSampler() }),
    parentbased_always_off: () => new ParentBasedSampler({ root: new AlwaysOffSampler() }),
    parentbased_traceidratio: () =>
      new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) }),
  };
  return root[name]();
}

// The exporters also read the OTEL_* headers from process.env, under the ones
// passed here. In production `env` is process.env, so it changes nothing; in
// tests, a shell's OTEL_EXPORTER_OTLP_HEADERS would reach the test collector.

/** The options both HTTP exporters (protobuf and JSON) take. */
function httpOptions(settings: ExporterSettings) {
  return {
    url: settings.url,
    headers: settings.headers,
    timeoutMillis: settings.timeoutMillis,
    compression: compression(settings),
    httpAgentOptions: { keepAlive: true, ...settings.tls },
  };
}

/** The options both gRPC exporters take. */
function grpcOptions(settings: ExporterSettings) {
  const metadata = new Metadata();
  for (const [key, value] of Object.entries(settings.headers)) {
    metadata.set(key, value);
  }
  const { ca, key, cert } = settings.tls;
  const plaintext =
    settings.url.startsWith('http://') ||
    (settings.insecure && !settings.url.startsWith('https://'));
  return {
    url: settings.url,
    metadata,
    credentials: plaintext
      ? grpcCredentials.createInsecure()
      : grpcCredentials.createSsl(ca ?? null, key ?? null, cert ?? null),
    timeoutMillis: settings.timeoutMillis,
    compression: compression(settings),
  };
}

function compression(settings: ExporterSettings): CompressionAlgorithm {
  return settings.compression === 'gzip' ? CompressionAlgorithm.GZIP : CompressionAlgorithm.NONE;
}

function traceExporter(settings: ExporterSettings): SpanExporter {
  switch (settings.protocol) {
    case 'grpc':
      return new GrpcTraceExporter(grpcOptions(settings));
    case 'http/protobuf':
      return new ProtoTraceExporter(httpOptions(settings));
    case 'http/json':
      return new JsonTraceExporter(httpOptions(settings));
  }
}

function metricsOtlpExporter(
  settings: ExporterSettings,
  temporality: OtelSettings['temporality'],
): PushMetricExporter {
  const temporalityPreference = {
    cumulative: AggregationTemporalityPreference.CUMULATIVE,
    delta: AggregationTemporalityPreference.DELTA,
    lowmemory: AggregationTemporalityPreference.LOWMEMORY,
  }[temporality];
  switch (settings.protocol) {
    case 'grpc':
      return new GrpcMetricExporter({ ...grpcOptions(settings), temporalityPreference });
    case 'http/protobuf':
      return new ProtoMetricExporter({ ...httpOptions(settings), temporalityPreference });
    case 'http/json':
      return new JsonMetricExporter({ ...httpOptions(settings), temporalityPreference });
  }
}

/**
 * Wraps an exporter to log a warning when an export fails. The warning has the
 * endpoint without credentials, and the error without anything URL-like that
 * could carry them.
 */
function reportFailures<T extends SpanExporter | PushMetricExporter>(
  exporter: T,
  settings: ExporterSettings,
  signal: Signal,
  log: Log,
): T {
  const wrapped = Object.create(exporter) as T;
  wrapped.export = (items: never, done: Parameters<T['export']>[1]) => {
    exporter.export(items, (result) => {
      if (result.code !== ExportResultCode.SUCCESS) {
        log('warn', `couldn't send the ${signal} to the OpenTelemetry endpoint`, {
          stage: 'telemetry',
          signal,
          protocol: settings.protocol,
          endpoint: settings.displayUrl,
          error: exportError(result.error),
        });
      }
      done(result);
    });
  };
  return wrapped;
}

/** An export error's message, with the collector's reply when there is one. */
export function exportError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }
  const { code, data } = error as Error & { code?: unknown; data?: unknown };
  const parts = [error.message || error.name];
  if (typeof code === 'number') {
    parts.push(`(HTTP ${code})`);
  }
  if (typeof data === 'string' && data.trim() !== '') {
    parts.push(`: ${data.trim().slice(0, 300)}`);
  }
  // A URL in an error could hold the endpoint's user and password.
  return parts.join(' ').replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]*@/gi, '$1');
}
