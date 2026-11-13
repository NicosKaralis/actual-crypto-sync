import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  buildNote,
  currencyDecimals,
  formatAmount,
  formatDecimals,
  formatDelta,
  isSyncNote,
  parseNote,
  redactUrl,
  toUnits,
  walletPrefix,
} from '../src/format.ts';

describe('toUnits', () => {
  test('converts raw integer units with the token decimals', () => {
    assert.equal(toUnits(156919300n, 6), 156.9193);
    assert.equal(toUnits(1234567n, 8), 0.01234567);
    assert.equal(toUnits(0n, 6), 0);
    assert.equal(toUnits(123n, 0), 123);
  });

  test('handles 18-decimal tokens', () => {
    assert.equal(toUnits(1500000000000000000n, 18), 1.5);
    assert.equal(toUnits(1n, 18), 1e-18);
    // More digits than a double holds: the result is the nearest double to the exact value.
    assert.equal(toUnits(123456789012345678901234n, 18), Number('123456.789012345678901234'));
  });
});

describe('walletPrefix', () => {
  test('keeps the first and last four characters', () => {
    assert.equal(walletPrefix('TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ'), 'TC9F...R2MJ');
  });

  test('leaves short strings alone', () => {
    assert.equal(walletPrefix('short'), 'short');
  });
});

describe('redactUrl', () => {
  test('shortens wallet addresses in the path to their prefix', () => {
    assert.equal(
      redactUrl('https://api.trongrid.io/v1/accounts/TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ'),
      'https://api.trongrid.io/v1/accounts/TC9F...R2MJ',
    );
    assert.equal(
      redactUrl('https://mempool.space/api/address/bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v'),
      'https://mempool.space/api/address/bc1q...298v',
    );
  });

  test('drops the query string and fragment', () => {
    assert.equal(
      redactUrl('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=eur#x'),
      'https://api.coingecko.com/api/v3/simple/price',
    );
  });

  test('drops credentials in the URL', () => {
    assert.equal(redactUrl('http://user:pass@mempool.lan/api'), 'http://mempool.lan/api');
  });

  test('keeps short path segments', () => {
    assert.equal(redactUrl('http://actual:5006/sync/sync'), 'http://actual:5006/sync/sync');
  });

  test('something that is not a URL gives a placeholder', () => {
    assert.equal(redactUrl('not a url'), '(invalid URL)');
  });
});

describe('formatAmount', () => {
  test('prints the shortest exact decimal', () => {
    assert.equal(formatAmount(1000), '1000');
    assert.equal(formatAmount(154.910248), '154.910248');
    assert.equal(formatAmount(0), '0');
  });

  test('never uses exponent notation', () => {
    assert.equal(formatAmount(1.2e-7), '0.00000012');
    assert.equal(formatAmount(1e-18), '0.000000000000000001');
    assert.equal(formatAmount(1e21), '1000000000000000000000');
    assert.equal(formatAmount(1.5e22), '15000000000000000000000');
  });
});

describe('formatDecimals', () => {
  test('rounds to at most the given decimals and drops trailing zeros', () => {
    assert.equal(formatDecimals(2.009071000000006, 4), '2.0091');
    assert.equal(formatDecimals(46.6, 4), '46.6');
    assert.equal(formatDecimals(1000, 2), '1000');
    assert.equal(formatDecimals(0.297, 4), '0.297');
  });

  test('never uses exponent notation', () => {
    assert.equal(formatDecimals(1.2e-7, 8), '0.00000012');
    assert.equal(formatDecimals(1e21, 2), '1000000000000000000000');
  });

  test('prints values that round to zero as 0, never -0', () => {
    assert.equal(formatDecimals(1e-9, 8), '0');
    assert.equal(formatDecimals(-0.00001, 4), '0');
  });
});

describe('formatDelta', () => {
  test('always has a sign', () => {
    assert.equal(formatDelta(2.009071, 6), '+2.009071');
    assert.equal(formatDelta(-0.5, 4), '-0.5');
    assert.equal(formatDelta(0, 4), '+0');
  });

  test('a delta that rounds to zero is +0', () => {
    assert.equal(formatDelta(-0.00001, 4), '+0');
  });
});

describe('currencyDecimals', () => {
  test("uses each currency's minor units", () => {
    assert.equal(currencyDecimals('eur'), 2);
    assert.equal(currencyDecimals('usd'), 2);
    assert.equal(currencyDecimals('jpy'), 0);
    assert.equal(currencyDecimals('kwd'), 3);
  });
});

describe('buildNote', () => {
  test('a TRX note in EUR', () => {
    const note = buildNote({
      symbol: 'TRX',
      displayDecimals: 6,
      balance: 156.9193,
      delta: 2.009071,
      price: 0.297,
      currency: 'eur',
    });
    // 156.9193 * 0.297 = 46.6050321
    assert.equal(note, '156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.61 EUR)');
  });

  test('a TRX note in USD', () => {
    const note = buildNote({
      symbol: 'TRX',
      displayDecimals: 6,
      balance: 156.9193,
      delta: 2.009071,
      price: 0.3412,
      currency: 'usd',
    });
    // 156.9193 * 0.3412 = 53.54086516
    assert.equal(note, '156.9193 TRX (Δ +2.009071 @ 0.3412 USD/TRX, 53.54 USD)');
  });

  test('USDT shows 4 decimals, and no change is +0', () => {
    const note = buildNote({
      symbol: 'USDT',
      displayDecimals: 4,
      balance: 1000,
      delta: 0,
      price: 0.9312,
      currency: 'eur',
    });
    assert.equal(note, '1000 USDT (Δ +0 @ 0.9312 EUR/USDT, 931.2 EUR)');
  });

  test('USDT balances are rounded to 4 decimals', () => {
    const note = buildNote({
      symbol: 'USDT',
      displayDecimals: 4,
      balance: 154.910248,
      delta: -1.000051,
      price: 1,
      currency: 'eur',
    });
    assert.equal(note, '154.9102 USDT (Δ -1.0001 @ 1 EUR/USDT, 154.91 EUR)');
  });

  test('a BTC note keeps 8 decimals and the quote at most 4', () => {
    const note = buildNote({
      symbol: 'BTC',
      displayDecimals: 8,
      balance: 0.01234567,
      delta: 0.00012345,
      price: 91234.56789,
      currency: 'eur',
    });
    // 0.01234567 * 91234.56789 = 1126.3518..., the quote rounds to 91234.5679
    assert.equal(note, '0.01234567 BTC (Δ +0.00012345 @ 91234.5679 EUR/BTC, 1126.35 EUR)');
  });

  test('a tiny BTC balance never uses exponent notation', () => {
    const note = buildNote({
      symbol: 'BTC',
      displayDecimals: 8,
      balance: 1.2e-7,
      delta: 1.2e-7,
      price: 91234.56,
      currency: 'eur',
    });
    // 0.00000012 * 91234.56 = 0.0109481472
    assert.equal(note, '0.00000012 BTC (Δ +0.00000012 @ 91234.56 EUR/BTC, 0.01 EUR)');
  });

  test('a quote below 0.1 keeps 4 significant digits, never in exponent notation', () => {
    const note = buildNote({
      symbol: 'BTT',
      displayDecimals: 8,
      balance: 50_000_000,
      delta: 0,
      price: 2.92795e-7,
      currency: 'eur',
    });
    // 50000000 * 0.000000292795 = 14.63975
    assert.equal(note, '50000000 BTT (Δ +0 @ 0.0000002928 EUR/BTT, 14.64 EUR)');
  });

  test('the quote has at most 4 decimals, or more to keep 4 significant digits', () => {
    const quote = (price: number) =>
      /@ (\S+) /.exec(
        buildNote({
          symbol: 'X',
          displayDecimals: 8,
          balance: 1,
          delta: 0,
          price,
          currency: 'eur',
        }),
      )?.[1];
    assert.equal(quote(0.297), '0.297');
    assert.equal(quote(0.282493), '0.2825');
    assert.equal(quote(0.01359111), '0.01359');
    assert.equal(quote(0.00068379), '0.0006838');
    assert.equal(quote(0.001), '0.001');
    assert.equal(quote(0.00009999999), '0.0001');
    assert.equal(quote(1.234e-29), '0.00000000000000000000000000001234');
    assert.equal(quote(1.234e-31), '0.00000000000000000000000000000012');
    assert.equal(quote(1e-40), '0');
  });

  test('a currency without minor units has no decimals in the value', () => {
    const note = buildNote({
      symbol: 'TRX',
      displayDecimals: 6,
      balance: 156.9193,
      delta: 0,
      price: 41.2345,
      currency: 'jpy',
    });
    // 156.9193 * 41.2345 = 6470.48887585
    assert.equal(note, '156.9193 TRX (Δ +0 @ 41.2345 JPY/TRX, 6470 JPY)');
  });
});

describe('parseNote', () => {
  test('reads the current format in any currency', () => {
    assert.deepEqual(parseNote('156.9193 TRX (Δ +2.009071 @ 0.297 EUR/TRX, 46.61 EUR)'), {
      balance: 156.9193,
      symbol: 'TRX',
    });
    assert.deepEqual(parseNote('156.9193 TRX (Δ +0 @ 41.2345 JPY/TRX, 6470 JPY)'), {
      balance: 156.9193,
      symbol: 'TRX',
    });
  });

  test('reads 8-decimal BTC notes and symbols with digits', () => {
    assert.deepEqual(
      parseNote('0.01234567 BTC (Δ +0.00012345 @ 91234.5679 EUR/BTC, 1126.35 EUR)'),
      {
        balance: 0.01234567,
        symbol: 'BTC',
      },
    );
    assert.deepEqual(parseNote('12.5 USDT0 (Δ -1 @ 0.93 EUR/USDT0, 11.63 EUR)'), {
      balance: 12.5,
      symbol: 'USDT0',
    });
  });

  test('ignores text after the closing parenthesis', () => {
    assert.deepEqual(parseNote('1000 USDT (Δ +0 @ 0.9312 EUR/USDT, 931.2 EUR) checked by hand'), {
      balance: 1000,
      symbol: 'USDT',
    });
  });

  test('rejects anything that is not a whole sync note', () => {
    const rejected = [
      null,
      '',
      'coffee',
      'coffee 12.50',
      '1.2e-7 BTC (Δ +0 @ 91234.56 EUR/BTC, 0.01 EUR)', // exponent notation
      ' 1000 USDT (Δ +0 @ 0.93 EUR/USDT, 930 EUR)', // doesn't start with the balance
      '1000 USDT (Δ 0 @ 0.93 EUR/USDT, 930 EUR)', // the delta has no sign
      '1000 usdt (Δ +0 @ 0.93 EUR/usdt, 930 EUR)', // lowercase symbol
      '1000 USDT (Δ +0 @ 0.93 EUR/USDT, 930 EUR', // not closed
      '1000 USDT (Δ +0)', // no price
      '1000 USDT (Δ +0 @ 0.93 €/USDT, 930 €)', // a currency sign, not a code
      '1000 USDT (Δ +0 @ 0.93 EUR/TRX, 930 EUR)', // the quote is for another symbol
      '1000 USDT (Δ +0 @ 0.93 EUR/USDT, 930 USD)', // two currencies
      '1000 USDT (Δ +0 @ 0.93 EUR/USDT 930 EUR)', // no comma
      '1000 USDT (Δ +0 @ 0.93 eur/USDT, 930 eur)', // lowercase currency
      '1000 USDT (Δ +0 @ 0.93 EUR/USDT)', // no value
    ];
    for (const notes of rejected) {
      assert.equal(parseNote(notes), null, `${JSON.stringify(notes)} should be rejected`);
    }
  });
});

describe('isSyncNote', () => {
  test("is true only for a sync note with the account's symbol", () => {
    const note = '1000 USDT (Δ +0 @ 0.93 EUR/USDT, 930 EUR)';
    assert.equal(isSyncNote(note, 'USDT'), true);
    assert.equal(isSyncNote(note, 'TRX'), false);
    assert.equal(isSyncNote('100 EUR (Δ +5 @ 1 USD/EUR, 100 USD)', 'USDT'), false);
    assert.equal(isSyncNote('coffee', 'USDT'), false);
    assert.equal(isSyncNote(null, 'USDT'), false);
  });
});

describe('round trip', () => {
  test('every note buildNote writes is read back with its shown balance', () => {
    const cases = [
      { symbol: 'TRX', displayDecimals: 6, balance: 156.9193, delta: 2.009071, price: 0.297 },
      { symbol: 'USDT', displayDecimals: 4, balance: 154.910248, delta: -1, price: 0.93 },
      { symbol: 'BTC', displayDecimals: 8, balance: 1.2e-7, delta: 1.2e-7, price: 91234.56 },
      { symbol: 'BTC', displayDecimals: 8, balance: 0, delta: -0.5, price: 91234.56 },
      { symbol: 'USDT0', displayDecimals: 8, balance: 1e21, delta: 0, price: 1 },
    ];
    for (const c of cases) {
      for (const currency of ['eur', 'usd', 'jpy']) {
        const note = buildNote({ ...c, currency });
        assert.deepEqual(
          parseNote(note),
          { balance: Number(formatDecimals(c.balance, c.displayDecimals)), symbol: c.symbol },
          note,
        );
        assert.equal(isSyncNote(note, c.symbol), true, note);
      }
    }
  });
});
