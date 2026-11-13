// Logs are one line per entry on stdout. `text` is for people; `json` is one
// JSON object per line for log systems, with the active span's ids so a log
// line can be found from its trace. Never pass a secret, a full wallet address
// or a URL that wasn't through redactUrl in `msg` or `fields`.

import { stdout } from 'node:process';

import { trace } from '@opentelemetry/api';

export type Level = 'debug' | 'info' | 'warn' | 'error';

export type Log = (level: Level, msg: string, fields?: Record<string, unknown>) => void;

export const LOG_FORMATS = ['text', 'json'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

/** LOG_FORMAT's value: `text` when unset or empty; throws on anything else. */
export function parseLogFormat(value: string | undefined): LogFormat {
  const format = (value ?? '').trim().toLowerCase() || 'text';
  if (!(LOG_FORMATS as readonly string[]).includes(format)) {
    throw new Error(`LOG_FORMAT: use text or json, not ${JSON.stringify(value)}`);
  }
  return format as LogFormat;
}

/** A logger writing lines with `write`; debug entries only when `debug` is on. */
export function createLog({
  debug = false,
  format = 'text',
  write = (line: string) => {
    stdout.write(line);
  },
}: {
  debug?: boolean;
  format?: LogFormat;
  write?: (line: string) => void;
} = {}): Log {
  return (level, msg, fields = {}) => {
    if (level === 'debug' && !debug) {
      return;
    }
    const time = new Date().toISOString();
    if (format === 'text') {
      write(textLine(time, level, msg, fields));
      return;
    }
    const span = trace.getActiveSpan()?.spanContext();
    // time, level and msg first; fields can't overwrite them.
    const entry = { time, level, msg, ...fields, trace_id: span?.traceId, span_id: span?.spanId };
    Object.assign(entry, { time, level, msg });
    write(`${JSON.stringify(entry)}\n`);
  };
}

// `<time> <LEVEL> <msg> key=value ...`. Fields can't overwrite time, level or
// msg, and a newline in the message is escaped, so an entry is always one line.
function textLine(time: string, level: Level, msg: string, fields: Record<string, unknown>) {
  const parts = [
    time,
    level.toUpperCase().padEnd(5),
    msg.replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
  ];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && key !== 'time' && key !== 'level' && key !== 'msg') {
      parts.push(`${key}=${textValue(value)}`);
    }
  }
  return `${parts.join(' ')}\n`;
}

/** A field's value; quoted when it's empty or has a space, quote, `=` or backslash. */
function textValue(value: unknown): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  return text === '' || /[\s"=\\]/.test(text) ? JSON.stringify(text) : text;
}

/** An error's message, for logs and spans; anything else as a string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
