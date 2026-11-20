import { ApiError, apiUrl, isRecord } from '../../http.ts';
import type { Explorer } from '../../types.ts';
import { accountBalances } from './account-api.ts';

const ID = 'etherscan';
const DEFAULT_API_URL = 'https://api.etherscan.io/v2/api';

/**
 * Etherscan's API V2, one key for every chain it covers, picked by `chainid`:
 * one request for the native token and one for each contract. The key is
 * required. The free tier doesn't cover every chain (BNB Smart Chain is paid).
 */
export function etherscanExplorer({ chainId }: { chainId: number }): Explorer {
  return {
    id: ID,
    supportsContracts: true,
    settingKeys: ['api_url', 'api_key'],
    // The free tier allows 3 requests a second.
    serialIntervalMs: 350,
    rateLimitAdvice(error, { serial }) {
      if (!isRateLimit(error)) {
        return null;
      }
      return serial
        ? 'run less often, or use a paid Etherscan plan: Etherscan is limiting requests even in serial mode'
        : 'set serial: true to send one request at a time';
    },
    checkSettings(settings) {
      return settings.api_key
        ? null
        : 'add an API key (api_key: ${ETHERSCAN_API_KEY}): Etherscan answers no request without one';
    },
    getBalances({ wallet, tokens, settings, fetch }) {
      return accountBalances({
        service: ID,
        baseUrl: apiUrl(settings, DEFAULT_API_URL),
        params: { chainid: String(chainId), apikey: settings.api_key ?? '' },
        wallet,
        tokens,
        fetch,
      });
    },
  };
}

/** A 429, or `{ "status": "0", "result": "Max rate limit reached, ..." }`. */
function isRateLimit(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  const result = isRecord(error.body) ? error.body.result : undefined;
  return error.status === 429 || (typeof result === 'string' && /rate limit/i.test(result));
}
