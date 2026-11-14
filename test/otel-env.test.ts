import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { OtelEnvError, parseTelemetryEnv } from '../src/otel-env.ts';

const SECRET = 'secret-api-key';

function parse(env: Record<string, string>, files: Record<string, string> = {}) {
  return parseTelemetryEnv(env, (path) => {
    const content = files[path];
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return Buffer.from(content);
  });
}

/** Asserts that `env` is refused with a message matching `message`, and returns it. */
function refused(env: Record<string, string>, message: RegExp): string {
  let error: unknown;
  try {
    parse(env);
  } catch (e) {
    error = e;
  }
  assert.ok(error instanceof OtelEnvError, `not refused: ${JSON.stringify(env)}`);
  assert.match(error.message, message);
  return error.message;
}

describe('parseTelemetryEnv', () => {
  test('without variables: nothing exported, and the defaults', () => {
    const { settings, unused, ignoreUnused, disabledOnError } = parse({});
    assert.equal(settings.traces, undefined);
    assert.equal(settings.metrics, undefined);
    assert.deepEqual(settings.resource, { 'service.name': 'actual-crypto-sync' });
    assert.deepEqual(settings.sampler, { name: 'parentbased_always_on', ratio: 1 });
    assert.deepEqual(settings.propagators, ['tracecontext', 'baggage']);
    assert.equal(settings.temporality, 'cumulative');
    assert.deepEqual(unused, []);
    assert.equal(ignoreUnused, false);
    assert.equal(disabledOnError, false);
  });

  test('an endpoint alone: http/protobuf, 5 s, no compression, no headers', () => {
    const { settings } = parse({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' });
    assert.deepEqual(settings.traces, {
      protocol: 'http/protobuf',
      url: 'http://collector:4318/v1/traces',
      displayUrl: 'http://collector:4318/v1/traces',
      headers: {},
      timeoutMillis: 5000,
      compression: 'none',
      tls: { ca: undefined, cert: undefined, key: undefined },
      insecure: false,
    });
    assert.equal(settings.metrics?.url, 'http://collector:4318/v1/metrics');
  });

  test('empty values count as unset', () => {
    const { settings, unused } = parse({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      OTEL_EXPORTER_OTLP_PROTOCOL: '',
      OTEL_EXPORTER_OTLP_TIMEOUT: ' ',
      OTEL_BSP_SCHEDULE_DELAY: '',
    });
    assert.equal(settings.traces?.protocol, 'http/protobuf');
    assert.equal(settings.traces?.timeoutMillis, 5000);
    assert.deepEqual(unused, []);
  });

  describe('protocols and endpoints', () => {
    test('a signal-specific protocol wins over the general one', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
        OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: 'HTTP/Protobuf',
      });
      assert.equal(settings.traces?.protocol, 'http/json');
      assert.equal(settings.metrics?.protocol, 'http/protobuf');
    });

    test('gRPC uses the general endpoint as is', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4317',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
      });
      assert.equal(settings.traces?.url, 'http://collector:4317');
      assert.equal(settings.metrics?.url, 'http://collector:4317');
    });

    test('gRPC takes host:port without a scheme', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'collector:4317',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
        OTEL_EXPORTER_OTLP_INSECURE: 'true',
      });
      assert.equal(settings.traces?.url, 'collector:4317');
      assert.equal(settings.traces?.displayUrl, 'collector:4317');
      assert.equal(settings.traces?.insecure, true);
    });

    test('a signal-specific endpoint is used as is and wins over the general one', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://traces.example.com/custom',
      });
      assert.equal(settings.traces?.url, 'https://traces.example.com/custom');
      assert.equal(settings.metrics?.url, 'http://collector:4318/v1/metrics');
    });

    test('the display URL has no credentials and no query', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: `https://user:${SECRET}@collector:4318/otlp?token=${SECRET}`,
      });
      assert.equal(settings.traces?.displayUrl, 'https://collector:4318/otlp/v1/traces');
    });

    test('an unknown protocol is refused, grpc included in the choices', () => {
      refused(
        {
          OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318',
        },
        /^OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: use grpc, http\/protobuf, http\/json, not "http"$/,
      );
    });

    test('an endpoint that is not an http(s) URL is refused without showing it', () => {
      const message = refused(
        { OTEL_EXPORTER_OTLP_ENDPOINT: `collector-${SECRET}:4318` },
        /^OTEL_EXPORTER_OTLP_ENDPOINT: use an http:\/\/ or https:\/\/ URL$/,
      );
      assert.ok(!message.includes(SECRET));
      refused(
        { OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'ftp://collector/v1/metrics' },
        /^OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: use an http/,
      );
      refused(
        { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://[bad', OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc' },
        /^OTEL_EXPORTER_OTLP_ENDPOINT: not a valid URL$/,
      );
    });
  });

  describe('connection settings', () => {
    test('headers: URL-decoded, the signal-specific ones win per key', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer%20abc, x-tenant=one,',
        OTEL_EXPORTER_OTLP_METRICS_HEADERS: 'x-tenant=two',
      });
      assert.deepEqual(settings.traces?.headers, {
        Authorization: 'Bearer abc',
        'x-tenant': 'one',
      });
      assert.deepEqual(settings.metrics?.headers, {
        Authorization: 'Bearer abc',
        'x-tenant': 'two',
      });
    });

    test('a malformed header is refused without showing any value', () => {
      const message = refused(
        { OTEL_EXPORTER_OTLP_HEADERS: `api-key=${SECRET},${SECRET}` },
        /^OTEL_EXPORTER_OTLP_HEADERS: each entry must be key=value$/,
      );
      assert.ok(!message.includes(SECRET));
      const encoding = refused(
        { OTEL_EXPORTER_OTLP_HEADERS: `api-key=${SECRET}%zz` },
        /^OTEL_EXPORTER_OTLP_HEADERS: the entry "api-key" is not URL-encoded correctly$/,
      );
      assert.ok(!encoding.includes(SECRET));
    });

    test('timeouts: the signal-specific one wins; a bad one is refused', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_EXPORTER_OTLP_TIMEOUT: '2000',
        OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: '1000',
      });
      assert.equal(settings.traces?.timeoutMillis, 1000);
      assert.equal(settings.metrics?.timeoutMillis, 2000);
      refused(
        { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318', OTEL_EXPORTER_OTLP_METRICS_TIMEOUT: '0' },
        /^OTEL_EXPORTER_OTLP_METRICS_TIMEOUT: use a whole number of milliseconds above 0, not "0"$/,
      );
    });

    test('compression: gzip or none', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_EXPORTER_OTLP_TRACES_COMPRESSION: 'gzip',
      });
      assert.equal(settings.traces?.compression, 'gzip');
      assert.equal(settings.metrics?.compression, 'none');
      refused(
        { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318', OTEL_EXPORTER_OTLP_COMPRESSION: 'zstd' },
        /^OTEL_EXPORTER_OTLP_COMPRESSION: use gzip, none, not "zstd"$/,
      );
    });

    test('TLS files are read; the signal-specific ones win', () => {
      const { settings } = parse(
        {
          OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector:4318',
          OTEL_EXPORTER_OTLP_CERTIFICATE: '/certs/ca.pem',
          OTEL_EXPORTER_OTLP_METRICS_CERTIFICATE: '/certs/metrics-ca.pem',
          OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE: '/certs/client.pem',
          OTEL_EXPORTER_OTLP_CLIENT_KEY: '/certs/client.key',
        },
        {
          '/certs/ca.pem': 'CA',
          '/certs/metrics-ca.pem': 'METRICS CA',
          '/certs/client.pem': 'CERT',
          '/certs/client.key': 'KEY',
        },
      );
      assert.equal(settings.traces?.tls.ca?.toString(), 'CA');
      assert.equal(settings.metrics?.tls.ca?.toString(), 'METRICS CA');
      assert.equal(settings.traces?.tls.cert?.toString(), 'CERT');
      assert.equal(settings.traces?.tls.key?.toString(), 'KEY');
    });

    test('an unreadable TLS file, or a client certificate without its key, is refused', () => {
      refused(
        {
          OTEL_EXPORTER_OTLP_ENDPOINT: 'https://c:4318',
          OTEL_EXPORTER_OTLP_CERTIFICATE: '/no.pem',
        },
        /^OTEL_EXPORTER_OTLP_CERTIFICATE: can't read the file \/no\.pem$/,
      );
      assert.throws(
        () =>
          parse(
            {
              OTEL_EXPORTER_OTLP_ENDPOINT: 'https://c:4318',
              OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE: '/client.pem',
            },
            { '/client.pem': 'CERT' },
          ),
        /must be set together/,
      );
    });

    test('INSECURE must be true or false', () => {
      refused(
        { OTEL_EXPORTER_OTLP_INSECURE: 'yes' },
        /^OTEL_EXPORTER_OTLP_INSECURE: use true or false, not "yes"$/,
      );
    });

    test('metrics temporality; the histogram aggregation is checked', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: 'Delta',
        OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION:
          'base2_exponential_bucket_histogram',
      });
      assert.equal(settings.temporality, 'delta');
      refused(
        { OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: 'sometimes' },
        /^OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: use cumulative, delta, lowmemory/,
      );
      refused(
        { OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION: 'linear' },
        /^OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION: use/,
      );
    });
  });

  describe('what is sent', () => {
    test('OTEL_SDK_DISABLED=true sends nothing and propagates nothing', () => {
      const { settings } = parse({
        OTEL_SDK_DISABLED: 'TRUE',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      });
      assert.equal(settings.traces, undefined);
      assert.equal(settings.metrics, undefined);
      assert.deepEqual(settings.propagators, []);
    });

    test('an exporter set to none turns off its signal only', () => {
      const { settings } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_TRACES_EXPORTER: 'none',
        OTEL_METRICS_EXPORTER: 'otlp',
      });
      assert.equal(settings.traces, undefined);
      assert.equal(settings.metrics?.url, 'http://collector:4318/v1/metrics');
    });

    test('an exporter the spec has but the tool does not ship is listed, not refused', () => {
      const { settings, unused } = parse({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
        OTEL_TRACES_EXPORTER: 'otlp,console',
        OTEL_METRICS_EXPORTER: 'prometheus',
      });
      assert.ok(settings.traces);
      assert.equal(settings.metrics, undefined);
      assert.deepEqual(
        unused.map((u) => u.name),
        ['OTEL_TRACES_EXPORTER=console', 'OTEL_METRICS_EXPORTER=prometheus'],
      );
      refused(
        { OTEL_TRACES_EXPORTER: 'otpl' },
        /^OTEL_TRACES_EXPORTER: use otlp or none, not "otpl"$/,
      );
    });

    test('OTEL_SERVICE_NAME wins over a service.name in OTEL_RESOURCE_ATTRIBUTES', () => {
      assert.deepEqual(
        parse({ OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment=prod,service.name=a' }).settings
          .resource,
        { 'service.name': 'a', 'deployment.environment': 'prod' },
      );
      assert.deepEqual(
        parse({
          OTEL_RESOURCE_ATTRIBUTES: 'service.name=a,team=home%20lab',
          OTEL_SERVICE_NAME: 'crypto-sync-prod',
        }).settings.resource,
        { 'service.name': 'crypto-sync-prod', team: 'home lab' },
      );
      refused({ OTEL_RESOURCE_ATTRIBUTES: 'prod' }, /^OTEL_RESOURCE_ATTRIBUTES: each entry/);
    });

    test('samplers, with the ratio for the traceidratio ones', () => {
      assert.deepEqual(
        parse({ OTEL_TRACES_SAMPLER: 'traceidratio', OTEL_TRACES_SAMPLER_ARG: '0.25' }).settings
          .sampler,
        { name: 'traceidratio', ratio: 0.25 },
      );
      assert.deepEqual(parse({ OTEL_TRACES_SAMPLER: 'always_off' }).settings.sampler, {
        name: 'always_off',
        ratio: 1,
      });
      refused(
        { OTEL_TRACES_SAMPLER: 'parentbased_traceidratio', OTEL_TRACES_SAMPLER_ARG: '2' },
        /^OTEL_TRACES_SAMPLER_ARG: use a number from 0 to 1, not "2"$/,
      );
      refused({ OTEL_TRACES_SAMPLER: 'sometimes' }, /^OTEL_TRACES_SAMPLER: use always_on/);
    });

    test('a sampler the tool does not ship, or an unused ratio, is listed and the default kept', () => {
      const xray = parse({ OTEL_TRACES_SAMPLER: 'xray' });
      assert.equal(xray.settings.sampler.name, 'parentbased_always_on');
      assert.deepEqual(xray.unused, [
        {
          name: 'OTEL_TRACES_SAMPLER=xray',
          reason: 'not available, parentbased_always_on is used',
        },
      ]);
      const arg = parse({ OTEL_TRACES_SAMPLER: 'always_on', OTEL_TRACES_SAMPLER_ARG: '0.5' });
      assert.deepEqual(
        arg.unused.map((u) => u.name),
        ['OTEL_TRACES_SAMPLER_ARG'],
      );
    });

    test('propagators: chosen, none, or not shipped (listed); a typo is refused', () => {
      assert.deepEqual(
        parse({ OTEL_PROPAGATORS: 'b3multi, tracecontext,b3multi' }).settings.propagators,
        ['b3multi', 'tracecontext'],
      );
      assert.deepEqual(parse({ OTEL_PROPAGATORS: 'none' }).settings.propagators, []);
      const jaeger = parse({ OTEL_PROPAGATORS: 'tracecontext,jaeger,xray' });
      assert.deepEqual(jaeger.settings.propagators, ['tracecontext']);
      assert.deepEqual(
        jaeger.unused.map((u) => u.name),
        ['OTEL_PROPAGATORS=jaeger', 'OTEL_PROPAGATORS=xray'],
      );
      refused(
        { OTEL_PROPAGATORS: 'tracecontxt' },
        /^OTEL_PROPAGATORS: use tracecontext, baggage, b3, b3multi, none, not "tracecontxt"$/,
      );
    });
  });

  describe('unused variables', () => {
    test('every other OTEL_* variable is listed with its reason, sorted', () => {
      const { unused } = parse({
        OTEL_LOGS_EXPORTER: 'otlp',
        OTEL_BSP_SCHEDULE_DELAY: '100',
        OTEL_EXPORTER_OTLP_ENDPIONT: 'http://collector:4318',
        OTEL_METRIC_EXPORT_INTERVAL: '1000',
        OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT: '10',
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://collector:4318/v1/logs',
        OTEL_SERVICE_NAME: 'used',
        NOT_OTEL: 'x',
      });
      assert.deepEqual(unused, [
        { name: 'OTEL_BSP_SCHEDULE_DELAY', reason: 'spans are sent when the run ends' },
        { name: 'OTEL_EXPORTER_OTLP_ENDPIONT', reason: 'unknown variable' },
        { name: 'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT', reason: 'logs go to stdout only' },
        { name: 'OTEL_LOGS_EXPORTER', reason: 'logs go to stdout only' },
        { name: 'OTEL_METRIC_EXPORT_INTERVAL', reason: 'metrics are sent once, when the run ends' },
        { name: 'OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT', reason: 'the default limits are used' },
      ]);
    });

    test('TELEMETRY_IGNORE_UNUSED_ENV and TELEMETRY_DISABLED_ON_ERROR are booleans', () => {
      const result = parse({
        TELEMETRY_IGNORE_UNUSED_ENV: 'true',
        TELEMETRY_DISABLED_ON_ERROR: 'True',
      });
      assert.equal(result.ignoreUnused, true);
      assert.equal(result.disabledOnError, true);
      refused(
        { TELEMETRY_IGNORE_UNUSED_ENV: '1' },
        /^TELEMETRY_IGNORE_UNUSED_ENV: use true or false/,
      );
    });
  });
});
