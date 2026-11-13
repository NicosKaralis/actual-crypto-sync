import { ApiError, apiUrl, getJson, isRecord, wholeNumber } from '../../http.ts';
import type { Explorer } from '../../types.ts';

const ID = 'mempool-space';
const DEFAULT_API_URL = 'https://mempool.space/api';

/**
 * The Esplora API's `GET /address/{address}`, which mempool.space and any
 * mempool or Esplora instance serve. Only confirmed amounts count: what's in
 * the mempool can still change.
 */
export const mempoolSpace: Explorer = {
  id: ID,
  supportsContracts: false,
  settingKeys: ['api_url'],
  // mempool.space doesn't publish its limit; one request a second is a cautious pace.
  serialIntervalMs: 1000,
  rateLimitAdvice(error, { serial }) {
    if (!(error instanceof ApiError) || error.status !== 429) {
      return null;
    }
    const ownInstance = 'point api_url at your own mempool instance';
    return serial
      ? ownInstance
      : `set serial: true to send one request at a time, or ${ownInstance}`;
  },
  async getBalances({ wallet, tokens, settings, fetch }) {
    for (const token of tokens) {
      if (token.kind !== 'native') {
        throw new Error(`${ID}: reads only BTC, not ${token.symbol}`);
      }
    }
    const url = `${apiUrl(settings, DEFAULT_API_URL)}/address/${wallet.address}`;
    const body = await getJson(ID, url, fetch);
    if (!isRecord(body) || !isRecord(body.chain_stats)) {
      throw new Error(`${ID}: expected chain_stats`);
    }
    const funded = wholeNumber(body.chain_stats.funded_txo_sum, ID, 'chain_stats.funded_txo_sum');
    const spent = wholeNumber(body.chain_stats.spent_txo_sum, ID, 'chain_stats.spent_txo_sum');
    if (spent > funded) {
      throw new Error(`${ID}: chain_stats: more spent than funded`);
    }
    return new Map(tokens.map((token): [string, bigint] => [token.symbol, funded - spent]));
  },
};
