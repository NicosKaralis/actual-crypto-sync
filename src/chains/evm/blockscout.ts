import { ApiError, apiUrl, isRecord } from '../../http.ts';
import type { Explorer } from '../../types.ts';
import { accountBalances } from './account-api.ts';

const ID = 'blockscout';
// The keyed Blockscout API, one URL for every chain, picked by chain_id.
const KEYED_API_URL = 'https://api.blockscout.com/v2/api';

/**
 * Blockscout's Etherscan-style API (`/api?module=account`): one request for
 * the native token and one for each contract. Without a key it asks the
 * chain's public instance (`defaultUrl`, up to and including /api), which
 * allows only a few requests; with a free key, the keyed API.
 */
export function blockscoutExplorer({
  defaultUrl,
  chainId,
}: {
  defaultUrl: string;
  chainId: number;
}): Explorer {
  return {
    id: ID,
    supportsContracts: true,
    settingKeys: ['api_url', 'api_key'],
    // The free key allows 5 requests a second; one a second also suits the public instances.
    serialIntervalMs: 1000,
    rateLimitAdvice(error, { settings, serial }) {
      if (!isRateLimit(error)) {
        return null;
      }
      const options: string[] = [];
      if (!settings.api_key) {
        options.push('add a free API key (api_key: ${BLOCKSCOUT_API_KEY})');
      }
      if (!serial) {
        options.push('set serial: true to send one request at a time');
      }
      return options.length > 0
        ? options.join(', or ')
        : 'run less often: Blockscout is limiting requests even with an API key and serial mode';
    },
    getBalances({ wallet, tokens, settings, fetch }) {
      const key = settings.api_key;
      return accountBalances({
        service: ID,
        baseUrl: apiUrl(settings, key ? KEYED_API_URL : defaultUrl),
        params: key ? { chain_id: String(chainId), apikey: key } : {},
        wallet,
        tokens,
        fetch,
      });
    },
  };
}

/** A 429, or `{ "status": "0", "message": "Too many requests. ..." }`. */
function isRateLimit(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  const message = isRecord(error.body) ? error.body.message : undefined;
  return (
    error.status === 429 ||
    (typeof message === 'string' && /too many requests|rate limit/i.test(message))
  );
}
