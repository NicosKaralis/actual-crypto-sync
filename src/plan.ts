import { buildNote, isSyncNote, parseNote } from './format.ts';
import type { Currency } from './types.ts';

/** The fields of an Actual transaction the plan needs. Amounts are integer cents. */
export interface PlanTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  notes: string | null;
  cleared: boolean;
}

export interface AccountPlan {
  /** The amount of today's sync transaction, in cents. */
  amountCents: number;
  /** What the wallet is worth, in cents. */
  valueCents: number;
  note: string;
  /** Today's sync transaction to update, or null to create one. */
  existingId: string | null;
  /** Further sync transactions dated today, left by overlapping runs. */
  toDelete: string[];
  /** Sync transactions from earlier days still uncleared. */
  toClear: string[];
}

/**
 * What to write to one account today. Pure: the same inputs give the same plan,
 * so a re-run after a crash or an overlapping run repairs the account.
 *
 * - `txs`: every transaction dated today plus the most recent ones before it,
 *   in any order.
 * - `balanceCents`: the account's balance through yesterday.
 * - `balance` and `price`: the wallet's balance in tokens and the token's price.
 *
 * Only sync transactions (notes for this symbol) are updated, deleted or
 * cleared. Manual transactions dated today count towards the amount, so the
 * account still ends at the wallet's value.
 */
export function planAccount(input: {
  txs: readonly PlanTransaction[];
  balanceCents: number;
  balance: number;
  price: number;
  symbol: string;
  displayDecimals: number;
  currency: Currency;
  today: string;
}): AccountPlan {
  const { balanceCents, balance, price, symbol, displayDecimals, currency, today } = input;
  if (!Number.isFinite(price) || price <= 0) {
    // Writing with no price would set the account to 0.
    throw new RangeError(`no valid price for ${symbol}: ${price}`);
  }

  // Newest first, then by id, so every run (and two overlapping runs) picks
  // the same transactions whatever order Actual returned them in.
  const txs = [...input.txs].sort((a, b) => compare(b.date, a.date) || compare(a.id, b.id));
  const isSync = (tx: PlanTransaction) => isSyncNote(tx.notes, symbol);

  const syncToday = txs.filter((tx) => tx.date === today && isSync(tx));
  const manualTodayCents = txs
    .filter((tx) => tx.date === today && !isSync(tx))
    .reduce((sum, tx) => sum + tx.amount, 0);

  const valueCents = Math.round(balance * price * 100);
  const amountCents = valueCents - (balanceCents + manualTodayCents);

  const previous = txs.find((tx) => tx.date < today && isSync(tx));
  const previousBalance = previous ? (parseNote(previous.notes)?.balance ?? 0) : 0;

  return {
    amountCents,
    valueCents,
    note: buildNote({
      symbol,
      displayDecimals,
      balance,
      delta: balance - previousBalance,
      price,
      currency,
    }),
    existingId: syncToday[0]?.id ?? null,
    toDelete: syncToday.slice(1).map((tx) => tx.id),
    toClear: txs.filter((tx) => tx.date < today && isSync(tx) && !tx.cleared).map((tx) => tx.id),
  };
}

// Plain code-unit order, not locale order, so it's the same on every machine.
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
