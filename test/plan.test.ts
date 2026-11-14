import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type PlanTransaction, planAccount } from '../src/plan.ts';

const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';

function syncTx(id: string, date: string, balance: string, cleared = false): PlanTransaction {
  return {
    id,
    date,
    amount: 0,
    notes: `${balance} TRX (Δ +0 @ 0.3 EUR/TRX, 1 EUR)`,
    cleared,
    reconciled: false,
  };
}

/** A sync entry the user reconciled in Actual: reconciled is always cleared too. */
function reconciledTx(id: string, date: string, amount: number): PlanTransaction {
  return { ...syncTx(id, date, '150', true), amount, reconciled: true };
}

function manualTx(id: string, date: string, amount: number, notes: string | null = 'coffee') {
  return { id, date, amount, notes, cleared: false, reconciled: false } satisfies PlanTransaction;
}

function plan(txs: PlanTransaction[], overrides: Partial<Parameters<typeof planAccount>[0]> = {}) {
  return planAccount({
    txs,
    balanceCents: 4000,
    balance: 156.9193,
    price: 0.297,
    symbol: 'TRX',
    displayDecimals: 6,
    currency: 'eur',
    today: TODAY,
    ...overrides,
  });
}

describe('planAccount', () => {
  test('no previous entry: a new transaction whose delta is the whole balance', () => {
    const result = plan([]);
    assert.equal(result.existingId, null);
    assert.deepEqual(result.toDelete, []);
    assert.deepEqual(result.toClear, []);
    assert.equal(result.note, '156.9193 TRX (Δ +156.9193 @ 0.297 EUR/TRX, 46.61 EUR)');
    // 156.9193 * 0.297 * 100 = 4660.50321 -> 4661 cents; minus the 4000 already there
    assert.equal(result.valueCents, 4661);
    assert.equal(result.amountCents, 661);
  });

  test("the delta comes from the newest earlier note, skipping today's", () => {
    const result = plan([
      syncTx('a', TODAY, '999'),
      syncTx('b', YESTERDAY, '154.910229'),
      syncTx('c', '2026-11-10', '100'),
    ]);
    // 156.9193 - 154.910229 = 2.009071
    assert.match(result.note, /^156\.9193 TRX \(Δ \+2\.009071 @/);
  });

  test('the previous note is found whatever order the transactions come in', () => {
    const txs = [
      syncTx('c', '2026-11-10', '100'),
      syncTx('a', TODAY, '999'),
      syncTx('b', YESTERDAY, '154.910229'),
    ];
    for (const order of [txs, [...txs].reverse()]) {
      assert.match(plan(order).note, /\(Δ \+2\.009071 @/);
    }
  });

  test("a note for another symbol, a manual note and a future note aren't the previous note", () => {
    const result = plan([
      {
        id: 'u',
        date: YESTERDAY,
        amount: 0,
        notes: '1000 USDT (Δ +0 @ 0.93 EUR/USDT, 930 EUR)',
        cleared: false,
        reconciled: false,
      },
      manualTx('m', YESTERDAY, -500, '5 TRX (Δ fee)'),
      syncTx('f', '2026-11-13', '1'),
      syncTx('b', '2026-11-09', '150'),
    ]);
    // 156.9193 - 150 = 6.9193
    assert.match(result.note, /\(Δ \+6\.9193 @/);
  });

  test("today's sync entry is updated", () => {
    const result = plan([syncTx('a', TODAY, '150'), syncTx('b', YESTERDAY, '150', true)]);
    assert.equal(result.existingId, 'a');
    assert.deepEqual(result.toDelete, []);
    assert.equal(result.reconciled, null);
  });

  test('two entries today: the lowest id is kept and the other deleted, in any order', () => {
    const txs = [syncTx('b2', TODAY, '150'), syncTx('a1', TODAY, '151')];
    for (const order of [txs, [...txs].reverse()]) {
      const result = plan(order);
      assert.equal(result.existingId, 'a1');
      assert.deepEqual(result.toDelete, ['b2']);
    }
  });

  test('manual transactions today count towards the amount', () => {
    const result = plan([manualTx('m1', TODAY, 250), manualTx('m2', TODAY, -100)]);
    // 4661 - (4000 + 250 - 100)
    assert.equal(result.amountCents, 4661 - (4000 + 150));
  });

  test('manual transactions are never updated, deleted or cleared', () => {
    const result = plan([
      manualTx('m1', TODAY, 250),
      manualTx('m2', YESTERDAY, 100),
      manualTx('m3', TODAY, 0, '1000 USDT (Δ +0 @ 0.93 EUR/USDT, 930 EUR)'), // another symbol's note counts as manual
      syncTx('s', TODAY, '150'),
    ]);
    assert.equal(result.existingId, 's');
    for (const id of ['m1', 'm2', 'm3']) {
      assert.ok(!result.toDelete.includes(id), `${id} in toDelete`);
      assert.ok(!result.toClear.includes(id), `${id} in toClear`);
    }
  });

  test('only uncleared sync entries before today are cleared', () => {
    const result = plan([
      syncTx('today', TODAY, '150'),
      syncTx('y', YESTERDAY, '150'),
      syncTx('old', '2026-11-01', '140'),
      syncTx('done', '2026-11-05', '145', true),
      manualTx('m', YESTERDAY, 100),
    ]);
    assert.deepEqual([...result.toClear].sort(), ['old', 'y']);
  });

  test('a reconciled entry today with another amount: skip, and nothing to write', () => {
    // The value is 4661 cents and 4000 are there, so today's entry should be 661.
    const result = plan([
      reconciledTx('r', TODAY, 500),
      syncTx('dup', TODAY, '150'),
      syncTx('y', YESTERDAY, '150'),
    ]);
    assert.equal(result.reconciled, 'skip');
    assert.equal(result.existingId, null);
    assert.deepEqual(result.toDelete, []);
    assert.deepEqual(result.toClear, []);
  });

  test('a reconciled entry today with the right amount is kept as it is', () => {
    const result = plan([
      reconciledTx('r', TODAY, 661),
      syncTx('dup', TODAY, '150'),
      syncTx('y', YESTERDAY, '150'),
    ]);
    assert.equal(result.reconciled, 'kept');
    assert.equal(result.existingId, null, 'not updated');
    assert.deepEqual(result.toDelete, ['dup'], 'the duplicate is not reconciled, so it goes');
    assert.deepEqual(result.toClear, ['y']);
  });

  test('two reconciled entries today count together, and neither is deleted', () => {
    const txs = [reconciledTx('r1', TODAY, 600), reconciledTx('r2', TODAY, 61)];
    for (const order of [txs, [...txs].reverse()]) {
      const result = plan(order);
      assert.equal(result.reconciled, 'kept');
      assert.deepEqual(result.toDelete, []);
    }
    assert.equal(
      plan([reconciledTx('r1', TODAY, 600), reconciledTx('r2', TODAY, 1)]).reconciled,
      'skip',
    );
  });

  test('a reconciled entry is never updated, deleted or cleared', () => {
    // Uncleared and reconciled can't happen in Actual; the guard holds anyway.
    const earlier = { ...reconciledTx('old', YESTERDAY, 100), cleared: false };
    for (const amount of [661, 500]) {
      const result = plan([reconciledTx('r', TODAY, amount), earlier]);
      assert.notEqual(result.existingId, 'r');
      for (const id of ['r', 'old']) {
        assert.ok(!result.toDelete.includes(id), `${id} in toDelete`);
        assert.ok(!result.toClear.includes(id), `${id} in toClear`);
      }
    }
  });

  test('applying a plan and planning again gives the same amount (idempotent)', () => {
    const before = [syncTx('b', YESTERDAY, '154.910229'), manualTx('m', TODAY, 300)];
    const first = plan(before);
    assert.equal(first.existingId, null);

    const after = [
      ...before,
      {
        id: 'new',
        date: TODAY,
        amount: first.amountCents,
        notes: first.note,
        cleared: false,
        reconciled: false,
      },
    ];
    const second = plan(after);
    assert.equal(second.existingId, 'new');
    assert.equal(second.amountCents, first.amountCents);
    assert.equal(second.note, first.note);
    assert.deepEqual(second.toDelete, []);
  });

  test("the note's value is the value written to the account", () => {
    for (const [balance, price] of [
      [156.9193, 0.297],
      [1.005, 1],
      [0.125, 0.1],
      [10.075, 1],
      [2.675, 1],
      [0.01234567, 91234.56789],
    ] as const) {
      const result = plan([], { balance, price });
      const shown = /, (?<value>[\d.]+) EUR\)$/.exec(result.note)?.groups?.value;
      assert.equal(Number(shown), result.valueCents / 100, result.note);
    }
  });

  test('a missing or zero price throws instead of writing the account down to 0', () => {
    for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => plan([], { price }), /price/);
    }
  });
});
