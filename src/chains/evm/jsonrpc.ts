import { ApiError, apiUrl, isRecord, postJson } from '../../http.ts';
import type { Explorer, Token } from '../../types.ts';

const ID = 'json-rpc';
// balanceOf(address): its selector, then the address padded to 32 bytes.
const BALANCE_OF = '0x70a08231';
// EIP-1474's "limit exceeded"; providers also answer -32029, -32090 or a message.
const RATE_LIMIT_CODES = new Set([-32005, -32029, -32090]);
const QUANTITY = /^0x[0-9a-fA-F]{1,64}$/;

/**
 * An EVM chain's standard JSON-RPC API, which every node and node provider
 * serves: `eth_getBalance` for the native token and `eth_call` of the ERC20
 * `balanceOf` for each contract, all in one batch request per wallet.
 * `defaultUrl` is a keyless public endpoint; api_url points at your own node,
 * or at a provider such as Infura or Alchemy, key included.
 */
export function jsonRpcExplorer({ defaultUrl }: { defaultUrl: string }): Explorer {
  return {
    id: ID,
    supportsContracts: true,
    settingKeys: ['api_url'],
    // Public endpoints don't publish their limits; one request a second is a cautious pace.
    serialIntervalMs: 1000,
    rateLimitAdvice(error, { serial }) {
      if (!isRateLimit(error)) {
        return null;
      }
      const ownNode = 'point api_url at your own node or a provider with an API key';
      return serial ? ownNode : `set serial: true to send one request at a time, or ${ownNode}`;
    },
    async getBalances({ wallet, tokens, settings, fetch }) {
      const calls = tokens.map((token, index) => ({
        jsonrpc: '2.0',
        id: index + 1,
        ...(token.kind === 'native'
          ? { method: 'eth_getBalance', params: [wallet.address, 'latest'] }
          : {
              method: 'eth_call',
              params: [{ to: token.contract, data: balanceOfData(wallet.address) }, 'latest'],
            }),
      }));
      if (calls.length === 0) {
        return new Map();
      }
      const body = await postJson(ID, apiUrl(settings, defaultUrl), fetch, calls);
      // A whole batch can be refused with one error object.
      if (isRecord(body) && body.error !== undefined) {
        throw rpcError(body.error);
      }
      if (!Array.isArray(body)) {
        throw new Error(`${ID}: expected a list of results`);
      }
      // A call refused with a bare error and no id, as Infura answers a rate
      // limit ({ code: -32005, message }), can't be matched to its token: it is
      // the batch's error, not a missing result.
      const refused = body.find(
        (entry: unknown) => isRecord(entry) && entry.id === undefined && entry.code !== undefined,
      );
      if (refused !== undefined) {
        throw rpcError(refused);
      }
      const byId = new Map<unknown, unknown>(
        body.map((entry: unknown) => [isRecord(entry) ? entry.id : undefined, entry]),
      );
      return new Map(
        tokens.map((token, index): [string, bigint] => [
          token.symbol,
          result(byId.get(index + 1), token),
        ]),
      );
    },
  };
}

function balanceOfData(address: string): string {
  return `${BALANCE_OF}${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

function result(entry: unknown, token: Token): bigint {
  if (!isRecord(entry)) {
    throw new Error(`${ID}: ${token.symbol}: no result`);
  }
  if (entry.error !== undefined) {
    throw rpcError(entry.error);
  }
  // eth_call on an address with no code answers "0x": the contract isn't on this chain.
  if (entry.result === '0x' && token.kind === 'contract') {
    throw new Error(`${ID}: ${token.symbol}: no contract at ${token.contract}`);
  }
  if (typeof entry.result !== 'string' || !QUANTITY.test(entry.result)) {
    throw new Error(`${ID}: ${token.symbol}: expected a hex number`);
  }
  return BigInt(entry.result);
}

/** A JSON-RPC error answer. Its message comes from the server: kept in the body, not in the error's message. */
function rpcError(error: unknown): ApiError {
  const code = isRecord(error) && typeof error.code === 'number' ? ` ${error.code}` : '';
  return new ApiError(ID, `JSON-RPC error${code}`, 200, error);
}

/** HTTP 429, or a JSON-RPC error with a rate limit code or message. */
function isRateLimit(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  if (error.status === 429) {
    return true;
  }
  const body = isRecord(error.body) && isRecord(error.body.error) ? error.body.error : error.body;
  if (!isRecord(body)) {
    return false;
  }
  return (
    (typeof body.code === 'number' && RATE_LIMIT_CODES.has(body.code)) ||
    (typeof body.message === 'string' && /rate limit|too many requests/i.test(body.message))
  );
}
