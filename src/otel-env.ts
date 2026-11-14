// The OpenTelemetry settings, read once from the standard OTEL_* variables
// (https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/
// and .../protocol/exporter/). Everything is read here and passed to the SDK
// explicitly, so `env` is the only source. A value the spec defines but this
// tool doesn't ship (a sampler, propagator or exporter) is skipped and listed
// as unused; a value that's simply wrong throws an OtelEnvError. Error messages
// never repeat a header, an endpoint or any other value that may hold a secret.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { redactUrl } from './format.ts';

export const SERVICE_NAME = 'actual-crypto-sync';

const DEFAULT_TIMEOUT_MS = 5000;

export const PROTOCOLS = ['grpc', 'http/protobuf', 'http/json'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

export type Signal = 'traces' | 'metrics';

const TEMPORALITIES = ['cumulative', 'delta', 'lowmemory'] as const;
export type Temporality = (typeof TEMPORALITIES)[number];

const HISTOGRAM_AGGREGATIONS = [
  'explicit_bucket_histogram',
  'base2_exponential_bucket_histogram',
] as const;

const SAMPLERS = [
  'always_on',
  'always_off',
  'traceidratio',
  'parentbased_always_on',
  'parentbased_always_off',
  'parentbased_traceidratio',
] as const;
export type SamplerName = (typeof SAMPLERS)[number];
const SPEC_SAMPLERS_NOT_SHIPPED = ['jaeger_remote', 'parentbased_jaeger_remote', 'xray'];

const PROPAGATORS = ['tracecontext', 'baggage', 'b3', 'b3multi'] as const;
export type PropagatorName = (typeof PROPAGATORS)[number];
const SPEC_PROPAGATORS_NOT_SHIPPED = ['jaeger', 'xray', 'ottrace'];

const SPEC_EXPORTERS_NOT_SHIPPED = ['console', 'zipkin', 'prometheus', 'logging'];

/** Where and how one signal is exported. */
export interface ExporterSettings {
  protocol: Protocol;
  /** The final URL: with /v1/<signal> for HTTP, as given for gRPC. */
  url: string;
  /** The endpoint for logs: no credentials, no query. */
  displayUrl: string;
  headers: Record<string, string>;
  timeoutMillis: number;
  compression: 'gzip' | 'none';
  /** PEM contents of the CERTIFICATE, CLIENT_CERTIFICATE and CLIENT_KEY files. */
  tls: { ca?: Buffer; cert?: Buffer; key?: Buffer };
  /** gRPC only: plaintext for an endpoint without a scheme. */
  insecure: boolean;
}

export interface OtelSettings {
  /** Undefined when the signal isn't exported. */
  traces?: ExporterSettings;
  metrics?: ExporterSettings;
  temporality: Temporality;
  resource: Record<string, string>;
  sampler: { name: SamplerName; ratio: number };
  /** Empty for none. Only requests to the Actual server get them. */
  propagators: PropagatorName[];
}

export interface Unused {
  name: string;
  reason: string;
}

export interface TelemetryEnv {
  settings: OtelSettings;
  /** OTEL_* variables (or values) set but not used, for the warning. */
  unused: Unused[];
  /** TELEMETRY_IGNORE_UNUSED_ENV: no warning for `unused`. */
  ignoreUnused: boolean;
  /** TELEMETRY_DISABLED_ON_ERROR: an invalid value turns telemetry off instead of stopping. */
  disabledOnError: boolean;
}

export class OtelEnvError extends Error {
  override name = 'OtelEnvError';
}

/** Telemetry off: no exporters, no propagation. */
export const TELEMETRY_OFF: OtelSettings = {
  temporality: 'cumulative',
  resource: { 'service.name': SERVICE_NAME },
  sampler: { name: 'parentbased_always_on', ratio: 1 },
  propagators: [],
};

type Env = Record<string, string | undefined>;
type ReadFile = (path: string) => Buffer;

const EXPORTER_KEYS = [
  'ENDPOINT',
  'PROTOCOL',
  'HEADERS',
  'TIMEOUT',
  'COMPRESSION',
  'CERTIFICATE',
  'CLIENT_KEY',
  'CLIENT_CERTIFICATE',
  'INSECURE',
];

/** Every variable this tool reads; any other OTEL_* one is unused. */
export const SUPPORTED = new Set([
  ...EXPORTER_KEYS.flatMap((key) => [
    `OTEL_EXPORTER_OTLP_${key}`,
    `OTEL_EXPORTER_OTLP_TRACES_${key}`,
    `OTEL_EXPORTER_OTLP_METRICS_${key}`,
  ]),
  'OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE',
  'OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION',
  'OTEL_SDK_DISABLED',
  'OTEL_TRACES_EXPORTER',
  'OTEL_METRICS_EXPORTER',
  'OTEL_SERVICE_NAME',
  'OTEL_RESOURCE_ATTRIBUTES',
  'OTEL_TRACES_SAMPLER',
  'OTEL_TRACES_SAMPLER_ARG',
  'OTEL_PROPAGATORS',
]);

/** Why an OTEL_* variable this tool doesn't read has no effect, by name prefix. */
const UNUSED_REASONS: [RegExp, string][] = [
  [/^OTEL_(LOGS_EXPORTER|EXPORTER_OTLP_LOGS_|BLRP_)/, 'logs go to stdout only'],
  [/^OTEL_METRIC_EXPORT_/, 'metrics are sent once, when the run ends'],
  [/^OTEL_BSP_/, 'spans are sent when the run ends'],
  [/_LIMIT$/, 'the default limits are used'],
  [/^OTEL_LOG_LEVEL$/, 'the tool logs failed exports itself'],
  [/^OTEL_EXPORTER_(ZIPKIN|PROMETHEUS|JAEGER)_/, 'only OTLP export is available'],
  [/^OTEL_METRICS_EXEMPLAR_FILTER$/, 'the tool records no exemplars'],
  [/^OTEL_SEMCONV_STABILITY_OPT_IN$/, 'the tool uses the stable conventions only'],
  [/^OTEL_NODE_/, 'Node.js auto-instrumentation is not used'],
  [/^OTEL_(EXPERIMENTAL_)?CONFIG_FILE$/, 'configuration files are not supported'],
];

/**
 * Reads the telemetry settings from `env`. Throws an OtelEnvError for an
 * invalid value; `unused` lists what's set but has no effect.
 */
export function parseTelemetryEnv(env: Env, readFile: ReadFile = defaultReadFile): TelemetryEnv {
  const ignoreUnused = parseBoolean(env, 'TELEMETRY_IGNORE_UNUSED_ENV');
  const disabledOnError = parseBoolean(env, 'TELEMETRY_DISABLED_ON_ERROR');
  const unused: Unused[] = Object.keys(env)
    .filter((name) => name.startsWith('OTEL_') && value(env, name) !== undefined)
    .filter((name) => !SUPPORTED.has(name))
    .sort()
    .map((name) => ({
      name,
      reason: UNUSED_REASONS.find(([pattern]) => pattern.test(name))?.[1] ?? 'unknown variable',
    }));
  if (parseBoolean(env, 'OTEL_SDK_DISABLED')) {
    return { settings: TELEMETRY_OFF, unused, ignoreUnused, disabledOnError };
  }

  const tracesOn = exporterEnabled(env, 'OTEL_TRACES_EXPORTER', unused);
  const metricsOn = exporterEnabled(env, 'OTEL_METRICS_EXPORTER', unused);
  const traces = exporterSettings(env, 'traces', readFile);
  const metrics = exporterSettings(env, 'metrics', readFile);
  const settings: OtelSettings = {
    traces: tracesOn ? traces : undefined,
    metrics: metricsOn ? metrics : undefined,
    temporality: oneOf(
      env,
      'OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE',
      TEMPORALITIES,
      'cumulative',
    ),
    resource: resource(env),
    sampler: sampler(env, unused),
    propagators: propagators(env, unused),
  };
  // No effect (the tool has no histograms), but a wrong value is still a mistake.
  oneOf(
    env,
    'OTEL_EXPORTER_OTLP_METRICS_DEFAULT_HISTOGRAM_AGGREGATION',
    HISTOGRAM_AGGREGATIONS,
    'explicit_bucket_histogram',
  );
  return { settings, unused, ignoreUnused, disabledOnError };
}

/** A variable's value, trimmed; undefined when unset or empty (the spec treats both alike). */
function value(env: Env, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

/** The signal-specific variable's value, else the general one's. */
function signalValue(env: Env, signal: Signal, key: string): [string, string] | undefined {
  for (const name of [
    `OTEL_EXPORTER_OTLP_${signal.toUpperCase()}_${key}`,
    `OTEL_EXPORTER_OTLP_${key}`,
  ]) {
    const v = value(env, name);
    if (v !== undefined) {
      return [name, v];
    }
  }
  return undefined;
}

function parseBoolean(env: Env, name: string): boolean {
  const v = value(env, name)?.toLowerCase();
  if (v === undefined || v === 'false') {
    return false;
  }
  if (v === 'true') {
    return true;
  }
  throw new OtelEnvError(`${name}: use true or false, not ${JSON.stringify(env[name])}`);
}

function oneOf<T extends string>(env: Env, name: string, values: readonly T[], fallback: T): T {
  const v = value(env, name)?.toLowerCase();
  if (v === undefined) {
    return fallback;
  }
  if (!(values as readonly string[]).includes(v)) {
    throw new OtelEnvError(`${name}: use ${values.join(', ')}, not ${JSON.stringify(env[name])}`);
  }
  return v as T;
}

/** A comma-separated list, lowercased, without empty entries. */
function list(env: Env, name: string): string[] | undefined {
  const v = value(env, name);
  return v
    ?.split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * OTEL_TRACES_EXPORTER or OTEL_METRICS_EXPORTER: on when unset or when it
 * names `otlp`. `none` turns it off; exporters the spec has but this tool
 * doesn't ship are listed as unused.
 */
function exporterEnabled(env: Env, name: string, unused: Unused[]): boolean {
  const names = list(env, name);
  if (names === undefined) {
    return true;
  }
  for (const exporter of names) {
    if (SPEC_EXPORTERS_NOT_SHIPPED.includes(exporter)) {
      unused.push({ name: `${name}=${exporter}`, reason: 'only otlp and none are available' });
    } else if (exporter !== 'otlp' && exporter !== 'none') {
      throw new OtelEnvError(`${name}: use otlp or none, not ${JSON.stringify(env[name])}`);
    }
  }
  return names.includes('otlp') && !names.includes('none');
}

/**
 * Undefined when no endpoint is set: without one, the tool sends nothing. The
 * other settings are checked either way, since a wrong value is a mistake.
 */
function exporterSettings(
  env: Env,
  signal: Signal,
  readFile: ReadFile,
): ExporterSettings | undefined {
  const protocol = signalOneOf(env, signal, 'PROTOCOL', PROTOCOLS, 'http/protobuf');
  const endpoint = endpointUrl(env, signal, protocol);
  const settings = {
    protocol,
    headers: headers(env, signal),
    timeoutMillis: timeout(env, signal),
    compression: signalOneOf(env, signal, 'COMPRESSION', ['gzip', 'none'] as const, 'none'),
    tls: tls(env, signal, readFile),
    insecure: signalBoolean(env, signal, 'INSECURE'),
  };
  return endpoint && { ...settings, ...endpoint };
}

function signalOneOf<T extends string>(
  env: Env,
  signal: Signal,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const found = signalValue(env, signal, key);
  return found ? oneOf({ [found[0]]: found[1] }, found[0], values, fallback) : fallback;
}

function signalBoolean(env: Env, signal: Signal, key: string): boolean {
  const found = signalValue(env, signal, key);
  return found ? parseBoolean({ [found[0]]: found[1] }, found[0]) : false;
}

/**
 * Where a signal is exported. A signal-specific endpoint is used as is. The
 * general one is a base URL: HTTP adds /v1/traces or /v1/metrics, gRPC uses
 * it as is. gRPC also takes `host:port` without a scheme.
 */
function endpointUrl(
  env: Env,
  signal: Signal,
  protocol: Protocol,
): { url: string; displayUrl: string } | undefined {
  const specificName = `OTEL_EXPORTER_OTLP_${signal.toUpperCase()}_ENDPOINT`;
  const specific = value(env, specificName);
  const name = specific === undefined ? 'OTEL_EXPORTER_OTLP_ENDPOINT' : specificName;
  const raw = specific ?? value(env, name);
  if (raw === undefined) {
    return undefined;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const asUrl = hasScheme ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(asUrl);
  } catch {
    throw new OtelEnvError(`${name}: not a valid URL`);
  }
  if ((!hasScheme && protocol !== 'grpc') || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new OtelEnvError(
      protocol === 'grpc'
        ? `${name}: use an http:// or https:// URL, or host:port`
        : `${name}: use an http:// or https:// URL`,
    );
  }
  if (protocol === 'grpc' || specific !== undefined) {
    const display = redactUrl(asUrl).replace(/\/$/, '');
    return { url: raw, displayUrl: hasScheme ? display : display.replace(/^https:\/\//, '') };
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/v1/${signal}`;
  return { url: parsed.href, displayUrl: redactUrl(parsed.href) };
}

/** OTEL_EXPORTER_OTLP_HEADERS, then the signal's own, which win per key. */
function headers(env: Env, signal: Signal): Record<string, string> {
  return {
    ...keyValues(env, 'OTEL_EXPORTER_OTLP_HEADERS'),
    ...keyValues(env, `OTEL_EXPORTER_OTLP_${signal.toUpperCase()}_HEADERS`),
  };
}

/** A `key=value,key=value` list with URL-encoded values; the values are never in errors. */
function keyValues(env: Env, name: string): Record<string, string> {
  const result: Record<string, string> = {};
  const v = value(env, name);
  if (v === undefined) {
    return result;
  }
  for (const entry of v.split(',')) {
    if (entry.trim() === '') {
      continue;
    }
    const equals = entry.indexOf('=');
    const key = equals > 0 ? entry.slice(0, equals).trim() : '';
    if (key === '') {
      throw new OtelEnvError(`${name}: each entry must be key=value`);
    }
    try {
      result[decodeURIComponent(key)] = decodeURIComponent(entry.slice(equals + 1).trim());
    } catch {
      throw new OtelEnvError(
        `${name}: the entry ${JSON.stringify(key)} is not URL-encoded correctly`,
      );
    }
  }
  return result;
}

function timeout(env: Env, signal: Signal): number {
  const found = signalValue(env, signal, 'TIMEOUT');
  if (found === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }
  const ms = Number(found[1]);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new OtelEnvError(
      `${found[0]}: use a whole number of milliseconds above 0, not ${JSON.stringify(found[1])}`,
    );
  }
  return ms;
}

function tls(env: Env, signal: Signal, readFile: ReadFile): ExporterSettings['tls'] {
  const file = (key: string): Buffer | undefined => {
    const found = signalValue(env, signal, key);
    if (found === undefined) {
      return undefined;
    }
    try {
      return readFile(found[1]);
    } catch {
      throw new OtelEnvError(`${found[0]}: can't read the file ${found[1]}`);
    }
  };
  const result = {
    ca: file('CERTIFICATE'),
    cert: file('CLIENT_CERTIFICATE'),
    key: file('CLIENT_KEY'),
  };
  if ((result.cert === undefined) !== (result.key === undefined)) {
    throw new OtelEnvError(
      'OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE and OTEL_EXPORTER_OTLP_CLIENT_KEY must be set together',
    );
  }
  return result;
}

/** service.name, then OTEL_RESOURCE_ATTRIBUTES, then OTEL_SERVICE_NAME, which wins. */
function resource(env: Env): Record<string, string> {
  const result: Record<string, string> = {
    'service.name': SERVICE_NAME,
    ...keyValues(env, 'OTEL_RESOURCE_ATTRIBUTES'),
  };
  const serviceName = value(env, 'OTEL_SERVICE_NAME');
  if (serviceName !== undefined) {
    result['service.name'] = serviceName;
  }
  return result;
}

function sampler(env: Env, unused: Unused[]): OtelSettings['sampler'] {
  const fallback: SamplerName = 'parentbased_always_on';
  const raw = value(env, 'OTEL_TRACES_SAMPLER')?.toLowerCase();
  let name: SamplerName = fallback;
  if (raw !== undefined && SPEC_SAMPLERS_NOT_SHIPPED.includes(raw)) {
    unused.push({
      name: `OTEL_TRACES_SAMPLER=${raw}`,
      reason: `not available, ${fallback} is used`,
    });
  } else {
    name = oneOf(env, 'OTEL_TRACES_SAMPLER', SAMPLERS, fallback);
  }
  const arg = value(env, 'OTEL_TRACES_SAMPLER_ARG');
  if (arg === undefined) {
    return { name, ratio: 1 };
  }
  if (!name.endsWith('traceidratio')) {
    unused.push({
      name: 'OTEL_TRACES_SAMPLER_ARG',
      reason: 'only used by the traceidratio samplers',
    });
    return { name, ratio: 1 };
  }
  const ratio = Number(arg);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new OtelEnvError(
      `OTEL_TRACES_SAMPLER_ARG: use a number from 0 to 1, not ${JSON.stringify(env.OTEL_TRACES_SAMPLER_ARG)}`,
    );
  }
  return { name, ratio };
}

function propagators(env: Env, unused: Unused[]): PropagatorName[] {
  const names = list(env, 'OTEL_PROPAGATORS') ?? ['tracecontext', 'baggage'];
  const result: PropagatorName[] = [];
  for (const name of names) {
    if (SPEC_PROPAGATORS_NOT_SHIPPED.includes(name)) {
      unused.push({ name: `OTEL_PROPAGATORS=${name}`, reason: 'not available' });
    } else if (name !== 'none' && !(PROPAGATORS as readonly string[]).includes(name)) {
      throw new OtelEnvError(
        `OTEL_PROPAGATORS: use ${[...PROPAGATORS, 'none'].join(', ')}, not ${JSON.stringify(name)}`,
      );
    } else if (name !== 'none' && !result.includes(name as PropagatorName)) {
      result.push(name as PropagatorName);
    }
  }
  return names.includes('none') ? [] : result;
}

function defaultReadFile(path: string): Buffer {
  return readFileSync(resolve(path));
}
