import { keccak_256 } from '@noble/hashes/sha3.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * An EVM address: `0x` and 40 hex digits. All lower case or all upper case
 * carries no checksum and passes; mixed case is an EIP-55 checksum and must
 * match, so a typo shows up.
 */
export function isValidEvmAddress(address: string): boolean {
  if (!ADDRESS.test(address)) {
    return false;
  }
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) {
    return true;
  }
  return toChecksumAddress(address) === address;
}

/** EVM addresses are case-insensitive; lower case is their one spelling. */
export function normalizeEvmAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * The EIP-55 spelling: each letter of the address is upper case where the
 * matching hex digit of keccak256(lower-case address) is 8 or more.
 */
export function toChecksumAddress(address: string): string {
  const hex = address.slice(2).toLowerCase();
  const hash = keccak_256(new TextEncoder().encode(hex));
  let result = '0x';
  for (let i = 0; i < hex.length; i++) {
    const byte = hash[i >> 1] ?? 0;
    const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
    result += nibble >= 8 ? (hex[i] ?? '').toUpperCase() : hex[i];
  }
  return result;
}
