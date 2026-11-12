import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, test } from 'node:test';

import { AggregationTemporality, InMemoryMetricExporter } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';

import { startTelemetry } from '../src/telemetry.ts';
import { TRON_WALLET } from './fakes.ts';

function exporters() {
  return {
    spanExporter: new InMemorySpanExporter(),
    metricExporter: new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE),
  };
}

describe('startTelemetry', () => {
  test('the resource is only service.name, so series stay the same between runs', async () => {
    const { spanExporter, metricExporter } = exporters();
    const telemetry = startTelemetry({
      env: {},
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
      env: {},
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
    const telemetry = startTelemetry({ env: {}, spanExporter, metricExporter });
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

  test('an endpoint that is down still lets the run end within the timeout', async () => {
    const telemetry = startTelemetry({
      env: {
        // Nothing listens on port 9 (discard) on the loopback.
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:9/v1/traces',
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://127.0.0.1:9/v1/metrics',
        OTEL_EXPORTER_OTLP_TIMEOUT: '500',
      },
      instrumentFetch: false,
    });
    telemetry.tracer.startSpan('actual-crypto-sync.run').end();
    telemetry.gauges.lastRun.record(1);
    const started = performance.now();
    await telemetry.shutdown();
    assert.ok(performance.now() - started < 3000);
  });

  test('without endpoints there are no exporters, and shutdown is immediate', async () => {
    const telemetry = startTelemetry({ env: {}, instrumentFetch: false });
    telemetry.tracer.startSpan('actual-crypto-sync.run').end();
    telemetry.gauges.lastRun.record(1);
    const started = performance.now();
    await telemetry.shutdown();
    assert.ok(performance.now() - started < 200);
  });
});
