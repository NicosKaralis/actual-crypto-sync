import { ApiError, getJson, isRecord, wholeNumberString } from '../../http.ts';
import type { Token, Wallet } from '../../types.ts';

/**
 * The Etherscan-style `module=account` API, which Etherscan and Blockscout
 * both serve: `action=balance` for the native token and `action=tokenbalance`
 * for each contract, one request each. The answer is
 * `{ status: "1", message: "OK", result: "<raw amount>" }`, or status "0" with
 * the error in `result` or `message`.
 */
export async function accountBalances({
  service,
  baseUrl,
  params,
  wallet,
  tokens,
  fetch,
}: {
  service: string;
  baseUrl: string; // up to and including /api
  params: Record<string, string>; // added to each request, e.g. chainid and apikey
  wallet: Wallet;
  tokens: Token[];
  fetch: typeof globalThis.fetch;
}): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>();
  // One at a time: these APIs limit requests per second.
  for (const token of tokens) {
    const query = new URLSearchParams({
      ...params,
      module: 'account',
      ...(token.kind === 'native'
        ? { action: 'balance' }
        : { action: 'tokenbalance', contractaddress: token.contract ?? '' }),
      address: wallet.address,
      tag: 'latest',
    });
    const body = await getJson(service, `${baseUrl}?${query}`, fetch);
    if (!isRecord(body)) {
      throw new Error(`${service}: ${token.symbol}: expected a map`);
    }
    if (body.status !== '1') {
      throw new ApiError(service, 'the API answered an error', 200, body);
    }
    result.set(token.symbol, wholeNumberString(body.result, service, `${token.symbol}: result`));
  }
  return result;
}
