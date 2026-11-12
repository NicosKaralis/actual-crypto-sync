import type { Currency } from './types.ts';

// The quote (price per token) keeps at most 4 decimals in notes, whatever the
// currency's minor units: 0.297 EUR/TRX needs more than 2. Change it here if a
// token ever needs more, e.g. one quoted at 0.00001234 EUR.
export const QUOTE_DECIMALS = 4;

/**
 * Raw on-chain units (sun, satoshi, token units) to a number. The one place a
 * raw balance becomes a float.
 */
export function toUnits(raw: bigint, decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`decimals must be a non-negative integer, got ${decimals}`);
  }
  const sign = raw < 0n ? '-' : '';
  const digits = (raw < 0n ? -raw : raw).toString().padStart(decimals + 1, '0');
  const integer = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals);
  return Number(`${sign}${integer}.${fraction || '0'}`);
}

/** TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ -> TC9F...R2MJ */
export function walletPrefix(address: string): string {
  if (address.length < 8) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/** The shortest exact decimal, never in exponent notation: 1.2e-7 -> "0.00000012". */
export function formatAmount(v: number): string {
  return withoutExponent(String(v));
}

/** Rounds to at most `maxDecimals` and drops trailing zeros: (46.6, 4) -> "46.6". */
export function formatDecimals(v: number, maxDecimals: number): string {
  // toFixed switches to exponent notation from 1e21 on, where every double is
  // an integer anyway.
  if (Math.abs(v) >= 1e21) {
    return formatAmount(v);
  }
  const s = v.toFixed(maxDecimals);
  const trimmed = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return trimmed === '-0' ? '0' : trimmed;
}

/** A signed delta: +2.009071, -0.5; a delta that rounds to zero is +0. */
export function formatDelta(v: number, maxDecimals: number): string {
  const s = formatDecimals(Math.abs(v), maxDecimals);
  return s !== '0' && v < 0 ? `-${s}` : `+${s}`;
}

/** The currency's minor units, from ICU: eur 2, jpy 0, kwd 3. */
export function currencyDecimals(currency: Currency): number {
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/**
 * The note on a sync transaction:
 * "156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.61 EUR)".
 * Balance and delta use the token's display decimals, the quote
 * QUOTE_DECIMALS, the value the currency's minor units; none has trailing zeros.
 */
export function buildNote(note: {
  symbol: string;
  displayDecimals: number;
  balance: number;
  delta: number;
  price: number;
  currency: Currency;
}): string {
  const { symbol, displayDecimals, balance, delta, price, currency } = note;
  const code = currency.toUpperCase();
  const shownBalance = formatDecimals(balance, displayDecimals);
  const shownDelta = formatDelta(delta, displayDecimals);
  const quote = formatDecimals(price, QUOTE_DECIMALS);
  const value = formatDecimals(balance * price, currencyDecimals(currency));
  return `${shownBalance} ${symbol} (Δ ${shownDelta} @ ${quote} ${code}/${symbol}, ${value} ${code})`;
}

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const CURRENCY = '[A-Z]{3}|€'; // € in notes written by the Go version
// Either "<balance> <SYMBOL> (Δ <delta>)" (the Go version without a price) or
// "<balance> <SYMBOL> (Δ <delta> @ <quote> <CUR>/<SYMBOL>, <value> <CUR>)",
// at the start of the note. Text after the closing parenthesis is ignored.
const NOTE = new RegExp(
  `^(?<balance>${NUMBER}) (?<symbol>[A-Z0-9]+) \\(Δ [+-]${NUMBER}` +
    `(?: @ ${NUMBER} (?<quoteCurrency>${CURRENCY})/(?<quoteSymbol>[A-Z0-9]+), ${NUMBER} (?<valueCurrency>${CURRENCY}))?\\)`,
  'u',
);

/** The balance and symbol of a sync note, or null when the note isn't one. */
export function parseNote(notes: string | null): { balance: number; symbol: string } | null {
  const groups = notes ? NOTE.exec(notes)?.groups : undefined;
  if (!groups?.balance || !groups.symbol) {
    return null;
  }
  if (
    groups.quoteSymbol !== undefined &&
    (groups.quoteSymbol !== groups.symbol || groups.quoteCurrency !== groups.valueCurrency)
  ) {
    return null;
  }
  return { balance: Number(groups.balance), symbol: groups.symbol };
}

/** True when the note is a sync note for this symbol. */
export function isSyncNote(notes: string | null, symbol: string): boolean {
  return parseNote(notes)?.symbol === symbol;
}

function withoutExponent(s: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (!match) {
    return s;
  }
  const [, sign = '', integer = '', fraction = '', exponent = '0'] = match;
  const digits = integer + fraction;
  const point = integer.length + Number(exponent);
  if (point <= 0) {
    return `${sign}0.${'0'.repeat(-point)}${digits}`;
  }
  if (point >= digits.length) {
    return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  }
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
