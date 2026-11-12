// Logs are one JSON object per line on stdout, with the active span's ids so
// a log line can be found from its trace. Never pass a secret, a full wallet
// address or a URL that wasn't through redactUrl in `msg` or `fields`.

import { stdout } from 'node:process';

import { trace } from '@opentelemetry/api';

export type Level = 'debug' | 'info' | 'warn' | 'error';

export type Log = (level: Level, msg: string, fields?: Record<string, unknown>) => void;

/** A logger writing JSON lines with `write`; debug entries only when `debug` is on. */
export function createLog({
  debug = false,
  write = (line: string) => {
    stdout.write(line);
  },
}: {
  debug?: boolean;
  write?: (line: string) => void;
} = {}): Log {
  return (level, msg, fields = {}) => {
    if (level === 'debug' && !debug) {
      return;
    }
    const span = trace.getActiveSpan()?.spanContext();
    const time = new Date().toISOString();
    // time, level and msg first; fields can't overwrite them.
    const entry = { time, level, msg, ...fields, trace_id: span?.traceId, span_id: span?.spanId };
    Object.assign(entry, { time, level, msg });
    write(`${JSON.stringify(entry)}\n`);
  };
}

/** An error's message, for logs and spans; anything else as a string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
