import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, test } from 'node:test';

import { Server, ServerCredentials } from '@grpc/grpc-js';
import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';

import type { Log } from '../src/log.ts';
import { parseTelemetryEnv } from '../src/otel-env.ts';
import { exportError, startTelemetry } from '../src/telemetry.ts';
import { TRON_WALLET } from './fakes.ts';

function exporters() {
  return {
    spanExporter: new InMemorySpanExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
  };
}

describe('startTelemetry', () => {
  test('by default the resource is only service.name, so series stay the same between runs', async () => {
    const { spanExporter, metricExporter } = exporters();
    const telemetry = startTelemetry({
      spanExporter,
      metricExporter,
      instrumentFetch: false,
    });
    telemetry.tracer.startSpan('actual-crypto-sync.run').end();
    telemetry.gauges.lastRun.record(1);
    // Read before shutdown, which empties the in-memory span exporter.
    const [span] = spanExporter.getFinishedSpans();
    await telemetry.shutdown();

    assert.deepEqual(span?.resource.attributes, { 'service.name': 'actual-crypto-sync' });
    const [metrics] = metricExporter.getMetrics();
    assert.deepEqual(metrics?.resource.attributes, { 'service.name': 'actual-crypto-sync' });
  });

  test('gauges export under their metric names, with their labels', async () => {
    const { spanExporter, metricExporter } = exporters();
    const telemetry = startTelemetry({
      spanExporter,
      metricExporter,
      instrumentFetch: false,
    });
    const { gauges } = telemetry;
    gauges.lastRun.record(100);
    gauges.lastSuccess.record(100);
    gauges.runDuration.record(2.5);
    gauges.balance.record(156.9193, {
      chain: 'tron',
      symbol: 'TRX',
      account: 'TRX',
      explorer: 'trongrid',
    });
    gauges.price.record(0.297, { symbol: 'TRX', currency: 'eur', source: 'coingecko' });
    gauges.value.record(46.6, { chain: 'tron', symbol: 'TRX', account: 'TRX', currency: 'eur' });
    gauges.transactions.record(1, { action: 'created' });
    gauges.errors.record(0, { stage: 'wallet' });
    gauges.providerErrors.record(1, { kind: 'explorer', id: 'trongrid' });
    await telemetry.shutdown();

    const exported = new Map(
      metricExporter
        .getMetrics()
        .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
        .map((metric) => [metric.descriptor.name, metric.dataPoints]),
    );
    assert.deepEqual([...exported.keys()].sort(), [
      'actual_crypto_sync_balance',
      'actual_crypto_sync_errors',
      'actual_crypto_sync_last_run_timestamp_seconds',
      'actual_crypto_sync_last_success_timestamp_seconds',
      'actual_crypto_sync_price',
      'actual_crypto_sync_provider_errors',
      'actual_crypto_sync_run_duration_seconds',
      'actual_crypto_sync_transactions',
      'actual_crypto_sync_value',
    ]);
    const [balance] = exported.get('actual_crypto_sync_balance') ?? [];
    assert.equal(balance?.value, 156.9193);
    assert.deepEqual(balance?.attributes, {
      chain: 'tron',
      symbol: 'TRX',
      account: 'TRX',
      explorer: 'trongrid',
    });
  });

  test('fetch spans show wallets by prefix only, without the query, and add no metrics', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const { spanExporter, metricExporter } = exporters();
    const telemetry = startTelemetry({ spanExporter, metricExporter });
    let spans: ReturnType<typeof spanExporter.getFinishedSpans> = [];
    try {
      await telemetry.tracer.startActiveSpan('parent', async (span) => {
        const response = await fetch(
          `http://127.0.0.1:${port}/v1/accounts/${TRON_WALLET}?apikey=secret-in-query`,
          { headers: { 'TRON-PRO-API-KEY': 'secret-in-header' } },
        );
        await response.text();
        span.end();
      });
    } finally {
      spans = spanExporter.getFinishedSpans();
      await telemetry.shutdown();
      server.close();
    }

    const http = spans.find((span) => span.name === 'GET');
    assert.ok(http, `no fetch span in ${spans.map((span) => span.name).join(', ')}`);
    assert.equal(http.attributes['url.full'], `http://127.0.0.1:${port}/v1/accounts/TC9F...R2MJ`);
    assert.equal(http.attributes['url.path'], '/v1/accounts/TC9F...R2MJ');
    const everything = JSON.stringify(spans.map((span) => [span.attributes, span.events]));
    assert.ok(!everything.includes(TRON_WALLET));
    assert.ok(!everything.includes('secret-in-query'));
    assert.ok(!everything.includes('secret-in-header'));
    const names = metricExporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
      .map((metric) => metric.descriptor.name);
    assert.deepEqual(names, []);
  });

  describe('OTLP export', () => {
    interface Received {
      path: string;
      headers: IncomingHttpHeaders;
    }

    /** A collector on the loopback recording each export; `reply` picks the response. */
    async function collector(reply: (req: IncomingMessage) => [number, string] = () => [200, '']) {
      const received: Received[] = [];
      const server = createServer((req, res) => {
        received.push({ path: req.url ?? '', headers: req.headers });
        req.resume();
        req.on('end', () => {
          const [status, body] = reply(req);
          res.writeHead(status, { 'content-type': 'text/plain' }).end(body);
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      return {
        url: `http://127.0.0.1:${port}`,
        received,
        paths: () => received.map((r) => r.path).sort(),
        close: () => server.close(),
      };
    }

    async function exportOnce(env: Record<string, string>, log?: Log) {
      const { settings } = parseTelemetryEnv(env);
      const telemetry = startTelemetry({ settings, instrumentFetch: false, log });
      telemetry.tracer.startSpan('actual-crypto-sync.run').end();
      telemetry.gauges.lastRun.record(1);
      await telemetry.shutdown();
    }

    test('OTEL_EXPORTER_OTLP_ENDPOINT alone sends to /v1/traces and /v1/metrics', async () => {
      const c = await collector();
      try {
        await exportOnce({ OTEL_EXPORTER_OTLP_ENDPOINT: `${c.url}/otlp/` });
      } finally {
        c.close();
      }
      assert.deepEqual(c.paths(), ['/otlp/v1/metrics', '/otlp/v1/traces']);
    });

    test('a signal-specific endpoint wins over OTEL_EXPORTER_OTLP_ENDPOINT, used as is', async () => {
      const c = await collector();
      try {
        await exportOnce({
          OTEL_EXPORTER_OTLP_ENDPOINT: c.url,
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${c.url}/custom-traces`,
        });
      } finally {
        c.close();
      }
      assert.deepEqual(c.paths(), ['/custom-traces', '/v1/metrics']);
    });

    test('protobuf by default, JSON with http/json, per signal', async () => {
      const c = await collector();
      try {
        await exportOnce({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url });
        await exportOnce({
          OTEL_EXPORTER_OTLP_ENDPOINT: c.url,
          OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
          OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: 'http/protobuf',
        });
      } finally {
        c.close();
      }
      const types = c.received.map((r) => `${r.path} ${r.headers['content-type']}`).sort();
      assert.deepEqual(types, [
        '/v1/metrics application/x-protobuf',
        '/v1/metrics application/x-protobuf',
        '/v1/traces application/json',
        '/v1/traces application/x-protobuf',
      ]);
    });

    test('headers and gzip compression reach the collector', async () => {
      const c = await collector();
      try {
        await exportOnce({
          OTEL_EXPORTER_OTLP_ENDPOINT: c.url,
          OTEL_EXPORTER_OTLP_HEADERS: 'x-api-key=general,x-tenant=home',
          OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'x-api-key=traces',
          OTEL_EXPORTER_OTLP_COMPRESSION: 'gzip',
        });
      } finally {
        c.close();
      }
      const byPath = new Map(c.received.map((r) => [r.path, r.headers]));
      assert.equal(byPath.get('/v1/traces')?.['x-api-key'], 'traces');
      assert.equal(byPath.get('/v1/metrics')?.['x-api-key'], 'general');
      assert.equal(byPath.get('/v1/metrics')?.['x-tenant'], 'home');
      assert.equal(byPath.get('/v1/traces')?.['content-encoding'], 'gzip');
    });

    test('an exporter set to none sends nothing for its signal', async () => {
      const c = await collector();
      try {
        await exportOnce({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url, OTEL_TRACES_EXPORTER: 'none' });
      } finally {
        c.close();
      }
      assert.deepEqual(c.paths(), ['/v1/metrics']);
    });

    test('gRPC sends both signals to the endpoint, with the headers as metadata', async () => {
      const calls: { path: string; apiKey: unknown }[] = [];
      const server = new Server();
      const identity = (b: Buffer) => b;
      const service = Object.fromEntries(
        ['trace.v1.TraceService', 'metrics.v1.MetricsService'].map((name) => [
          name,
          {
            path: `/opentelemetry.proto.collector.${name}/Export`,
            requestStream: false,
            responseStream: false,
            requestSerialize: identity,
            requestDeserialize: identity,
            responseSerialize: identity,
            responseDeserialize: identity,
          },
        ]),
      );
      server.addService(
        service,
        Object.fromEntries(
          Object.entries(service).map(([name, { path }]) => [
            name,
            (
              call: { metadata: { get(key: string): unknown[] } },
              done: (error: null, reply: Buffer) => void,
            ) => {
              calls.push({ path, apiKey: call.metadata.get('x-api-key')[0] });
              done(null, Buffer.alloc(0));
            },
          ]),
        ),
      );
      const port = await new Promise<number>((resolve, reject) =>
        server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, p) =>
          error ? reject(error) : resolve(p),
        ),
      );
      try {
        await exportOnce({
          OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
          OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
          OTEL_EXPORTER_OTLP_HEADERS: 'x-api-key=grpc-key',
        });
      } finally {
        server.forceShutdown();
      }
      assert.deepEqual(calls.map((call) => `${call.path} ${call.apiKey}`).sort(), [
        '/opentelemetry.proto.collector.metrics.v1.MetricsService/Export grpc-key',
        '/opentelemetry.proto.collector.trace.v1.TraceService/Export grpc-key',
      ]);
    });

    test('a refused export logs a warning with the reply, never the credentials', async () => {
      // As VictoriaMetrics answers JSON metrics.
      const c = await collector(() => [
        400,
        "json encoding isn't supported for opentelemetry format. Use protobuf encoding",
      ]);
      const warnings: [string, Record<string, unknown> | undefined][] = [];
      try {
        await exportOnce(
          {
            OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: c.url.replace('://', '://user:secret-pass@'),
            OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
            OTEL_EXPORTER_OTLP_HEADERS: 'authorization=secret-header',
          },
          (level, msg, fields) => {
            if (level === 'warn') warnings.push([msg, fields]);
          },
        );
      } finally {
        c.close();
      }
      assert.equal(warnings.length, 1);
      const [msg, fields] = warnings[0] ?? [];
      assert.equal(msg, "couldn't send the metrics to the OpenTelemetry endpoint");
      assert.equal(fields?.endpoint, c.url);
      assert.equal(fields?.protocol, 'http/json');
      assert.match(String(fields?.error), /\(HTTP 400\) : json encoding isn't supported/);
      assert.ok(!JSON.stringify(warnings).includes('secret'));
    });
  });

  test('exportError keeps the reply and removes credentials from URLs', () => {
    const error = Object.assign(new Error('connect to https://user:pw@collector:4318 failed'), {
      code: 503,
      data: 'busy',
    });
    assert.equal(exportError(error), 'connect to https://collector:4318 failed (HTTP 503) : busy');
    assert.equal(exportError('nope'), 'unknown error');
  });

  describe('sampling and resource', () => {
    async function spansWith(env: Record<string, string>) {
      const spanExporter = new InMemorySpanExporter();
      const { settings } = parseTelemetryEnv(env);
      const telemetry = startTelemetry({ settings, spanExporter, instrumentFetch: false });
      for (let i = 0; i < 5; i++) {
        telemetry.tracer.startSpan('actual-crypto-sync.run').end();
      }
      const spans = spanExporter.getFinishedSpans();
      await telemetry.shutdown();
      return spans;
    }

    test('every run is traced by default; always_off and a ratio of 0 trace none', async () => {
      assert.equal((await spansWith({})).length, 5);
      assert.equal((await spansWith({ OTEL_TRACES_SAMPLER: 'always_off' })).length, 0);
      assert.equal(
        (await spansWith({ OTEL_TRACES_SAMPLER: 'traceidratio', OTEL_TRACES_SAMPLER_ARG: '0' }))
          .length,
        0,
      );
    });

    test('OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES set the resource', async () => {
      const [span] = await spansWith({
        OTEL_SERVICE_NAME: 'crypto-sync-prod',
        OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment=prod',
      });
      assert.deepEqual(span?.resource.attributes, {
        'service.name': 'crypto-sync-prod',
        'deployment.environment': 'prod',
      });
    });
  });

  describe('propagation', () => {
    /** Two servers on different origins: the Actual server and an explorer. */
    async function fetchBoth(env: Record<string, string>, propagateToActual = true) {
      const seen = new Map<string, IncomingHttpHeaders>();
      const servers = ['actual', 'explorer'].map((name) =>
        createServer((req, res) => {
          seen.set(name, req.headers);
          res.writeHead(200).end('{}');
        }),
      );
      const ports = await Promise.all(
        servers.map(
          (server) =>
            new Promise<number>((resolve) =>
              server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)),
            ),
        ),
      );
      const { settings } = parseTelemetryEnv(env);
      const telemetry = startTelemetry({ settings, spanExporter: new InMemorySpanExporter() });
      if (propagateToActual) {
        telemetry.propagateTo(`http://127.0.0.1:${ports[0]}/`);
      }
      try {
        await telemetry.tracer.startActiveSpan('parent', async (span) => {
          for (const port of ports) {
            await (await fetch(`http://127.0.0.1:${port}/`)).text();
          }
          span.end();
        });
      } finally {
        await telemetry.shutdown();
        for (const server of servers) server.close();
      }
      return seen;
    }

    test('only the Actual server gets traceparent; explorers never do', async () => {
      const seen = await fetchBoth({});
      assert.match(String(seen.get('actual')?.traceparent), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      assert.equal(seen.get('explorer')?.traceparent, undefined);
    });

    test('nothing is propagated before the Actual server is known', async () => {
      const seen = await fetchBoth({}, false);
      assert.equal(seen.get('actual')?.traceparent, undefined);
    });

    test('OTEL_PROPAGATORS picks the format; none sends nothing', async () => {
      const b3 = await fetchBoth({ OTEL_PROPAGATORS: 'b3' });
      assert.ok(b3.get('actual')?.b3);
      assert.equal(b3.get('actual')?.traceparent, undefined);
      assert.equal(b3.get('explorer')?.b3, undefined);
      const none = await fetchBoth({ OTEL_PROPAGATORS: 'none' });
      assert.equal(none.get('actual')?.traceparent, undefined);
    });
  });

  test('an endpoint that is down still lets the run end within the timeout', async () => {
    const { settings } = parseTelemetryEnv({
      // Nothing listens on port 9 (discard) on the loopback.
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:9/v1/traces',
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://127.0.0.1:9/v1/metrics',
      OTEL_EXPORTER_OTLP_TIMEOUT: '500',
    });
    const warnings: string[] = [];
    const telemetry = startTelemetry({
      settings,
      instrumentFetch: false,
      log: (level, msg) => {
        if (level === 'warn') warnings.push(msg);
      },
    });
    telemetry.tracer.startSpan('actual-crypto-sync.run').end();
    telemetry.gauges.lastRun.record(1);
    const started = performance.now();
    await telemetry.shutdown();
    assert.ok(performance.now() - started < 3000);
    assert.ok(warnings.length > 0, 'no warning for the failed exports');
  });

  test('without endpoints there are no exporters, and shutdown is immediate', async () => {
    const telemetry = startTelemetry({ instrumentFetch: false });
    telemetry.tracer.startSpan('actual-crypto-sync.run').end();
    telemetry.gauges.lastRun.record(1);
    const started = performance.now();
    await telemetry.shutdown();
    assert.ok(performance.now() - started < 200);
  });
});
