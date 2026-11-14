import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';

import { createLog, parseLogFormat } from '../src/log.ts';
import { startTelemetry } from '../src/telemetry.ts';

function capture(debug = false) {
  const lines: string[] = [];
  const log = createLog({ debug, format: 'json', write: (line) => lines.push(line) });
  const parsed = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { log, lines, parsed };
}

describe('log', () => {
  test('one JSON line per entry, with time, level, msg and the fields', () => {
    const { log, lines, parsed } = capture();
    log('info', 'synced', { account: 'TRX', amount: 5 });
    assert.equal(lines.length, 1);
    assert.ok(lines[0]?.endsWith('\n'));
    const [entry] = parsed();
    assert.equal(entry?.level, 'info');
    assert.equal(entry?.msg, 'synced');
    assert.equal(entry?.account, 'TRX');
    assert.equal(entry?.amount, 5);
    assert.ok(typeof entry?.time === 'string' && !Number.isNaN(Date.parse(entry.time)));
    // No active span, no ids.
    assert.equal(entry?.trace_id, undefined);
  });

  test('debug entries only with debug on', () => {
    const quiet = capture(false);
    quiet.log('debug', 'GET https://api.trongrid.io');
    assert.equal(quiet.lines.length, 0);
    const loud = capture(true);
    loud.log('debug', 'GET https://api.trongrid.io');
    assert.equal(loud.parsed()[0]?.level, 'debug');
  });

  test('trace_id and span_id come from the active span', async () => {
    const telemetry = startTelemetry({
      spanExporter: new InMemorySpanExporter(),
      instrumentFetch: false,
    });
    const { log, parsed } = capture();
    await telemetry.tracer.startActiveSpan('outer', async (span) => {
      await Promise.resolve();
      log('info', 'inside');
      assert.deepEqual(
        [parsed()[0]?.trace_id, parsed()[0]?.span_id],
        [span.spanContext().traceId, span.spanContext().spanId],
      );
      span.end();
    });
    await telemetry.shutdown();
  });

  test("fields can't overwrite time, level or msg", () => {
    const { log, parsed } = capture();
    log('warn', 'real', { msg: 'fake', level: 'info' });
    assert.equal(parsed()[0]?.msg, 'real');
    assert.equal(parsed()[0]?.level, 'warn');
  });
});

describe('text log', () => {
  function text(debug = false) {
    const lines: string[] = [];
    const log = createLog({ debug, write: (line) => lines.push(line) });
    return { log, lines };
  }

  test('is the default: time, level, message, then the fields', () => {
    const { log, lines } = text();
    log('info', 'created a transaction', {
      account: 'TRON: TRX',
      amount_cents: 4661,
      dry_run: false,
    });
    assert.equal(lines.length, 1);
    assert.match(
      lines[0] ?? '',
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z INFO {2}created a transaction account="TRON: TRX" amount_cents=4661 dry_run=false\n$/,
    );
  });

  test('quotes values with spaces, quotes, = or backslashes, and empty values', () => {
    const { log, lines } = text();
    log('warn', 'x', {
      a: 'plain',
      b: '',
      c: 'say "hi"',
      d: 'k=v',
      e: 'C:\\dir',
      f: null,
      g: undefined,
    });
    assert.ok(
      lines[0]?.endsWith(' WARN  x a=plain b="" c="say \\"hi\\"" d="k=v" e="C:\\\\dir" f=null\n'),
    );
  });

  test('a newline in the message or a field stays on one line', () => {
    const { log, lines } = text();
    log('error', 'first\nsecond\r\nthird', { detail: 'a\nb' });
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.split('\n').length, 2);
    assert.ok(lines[0]?.includes(' ERROR first\\nsecond\\r\\nthird detail="a\\nb"'));
  });

  test("fields can't overwrite time, level or msg", () => {
    const { log, lines } = text();
    log('warn', 'real', { msg: 'fake', level: 'info', time: 'never' });
    assert.match(lines[0] ?? '', /^\S+ WARN {2}real\n$/);
  });

  test('debug entries only with debug on', () => {
    const quiet = text(false);
    quiet.log('debug', 'GET https://api.trongrid.io');
    assert.equal(quiet.lines.length, 0);
    const loud = text(true);
    loud.log('debug', 'GET https://api.trongrid.io');
    assert.match(loud.lines[0] ?? '', / DEBUG GET https:\/\/api\.trongrid\.io\n$/);
  });
});

describe('parseLogFormat', () => {
  test('text when unset or empty', () => {
    assert.equal(parseLogFormat(undefined), 'text');
    assert.equal(parseLogFormat(''), 'text');
    assert.equal(parseLogFormat('  '), 'text');
  });

  test('text or json, in any case', () => {
    assert.equal(parseLogFormat('text'), 'text');
    assert.equal(parseLogFormat('JSON'), 'json');
    assert.equal(parseLogFormat(' json '), 'json');
  });

  test('anything else is an error that names the value', () => {
    assert.throws(() => parseLogFormat('xml'), {
      message: 'LOG_FORMAT: use text or json, not "xml"',
    });
  });
});
