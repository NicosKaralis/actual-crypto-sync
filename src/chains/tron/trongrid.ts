import { walletPrefix } from '../../format.ts';
import { apiUrl, getJson, isRecord, wholeNumber, wholeNumberString } from '../../http.ts';
import type { Explorer, Token } from '../../types.ts';

const ID = 'trongrid';
const DEFAULT_API_URL = 'https://api.trongrid.io';

/**
 * TronGrid's `GET /v1/accounts/{address}`: TRX and every TRC20 token in one
 * request. TRON leaves out fields that are zero, so a missing amount is 0.
 */
export const trongrid: Explorer = {
  id: ID,
  supportsContracts: true,
  async getBalances({ wallet, tokens, settings, fetch }) {
    const headers: Record<string, string> = settings.api_key
      ? { 'TRON-PRO-API-KEY': settings.api_key }
      : {};
    const url = `${apiUrl(settings, DEFAULT_API_URL)}/v1/accounts/${wallet.address}`;
    const body = await getJson(ID, url, fetch, headers);

    if (!isRecord(body) || !Array.isArray(body.data)) {
      throw new Error(`${ID}: expected a data list`);
    }
    // An address that has never received anything isn't an account yet.
    if (body.data.length === 0) {
      throw new Error(`${ID}: account not found: ${walletPrefix(wallet.address)}`);
    }
    const account: unknown = body.data[0];
    if (!isRecord(account)) {
      throw new Error(`${ID}: data[0]: expected an account`);
    }

    return new Map(
      tokens.map((token): [string, bigint] => [
        token.symbol,
        token.kind === 'native' ? trx(account) : trc20(account, token),
      ]),
    );
  },
};

/**
 * TRX in sun: what's available, plus what's staked (frozenV2, bandwidth with no
 * type and energy), plus what's staked and delegated to other accounts. The
 * TRON_POWER entry is voting power, not more TRX.
 */
function trx(account: Record<string, unknown>): bigint {
  let total = amount(account.balance, 'data[0].balance');

  const frozen = account.frozenV2 ?? [];
  if (!Array.isArray(frozen)) {
    throw new Error(`${ID}: data[0].frozenV2: expected a list`);
  }
  frozen.forEach((entry: unknown, index) => {
    const path = `data[0].frozenV2[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`${ID}: ${path}: expected a map`);
    }
    if (entry.type !== 'TRON_POWER') {
      total += amount(entry.amount, `${path}.amount`);
    }
  });

  // Energy delegations are kept under account_resource, bandwidth ones on the account.
  const resource = account.account_resource ?? {};
  if (!isRecord(resource)) {
    throw new Error(`${ID}: data[0].account_resource: expected a map`);
  }
  total += amount(
    resource.delegated_frozenV2_balance_for_energy,
    'data[0].account_resource.delegated_frozenV2_balance_for_energy',
  );
  total += amount(
    account.delegated_frozenV2_balance_for_bandwidth,
    'data[0].delegated_frozenV2_balance_for_bandwidth',
  );
  return total;
}

/** A TRC20 token: its contract's entry in `trc20`, a list of one-key maps; 0 when it isn't there. */
function trc20(account: Record<string, unknown>, token: Token): bigint {
  const list = account.trc20 ?? [];
  if (!Array.isArray(list)) {
    throw new Error(`${ID}: data[0].trc20: expected a list`);
  }
  for (const entry of list) {
    if (isRecord(entry) && token.contract !== undefined && Object.hasOwn(entry, token.contract)) {
      return wholeNumberString(entry[token.contract], ID, 'data[0].trc20');
    }
  }
  return 0n;
}

function amount(value: unknown, path: string): bigint {
  return value === undefined ? 0n : wholeNumber(value, ID, path);
}
