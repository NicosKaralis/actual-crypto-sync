import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';

import { createLog } from '../src/log.ts';
import { startTelemetry } from '../src/telemetry.ts';

function capture(debug = false) {
  const lines: string[] = [];
  const log = createLog({ debug, write: (line) => lines.push(line) });
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
      env: {},
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
