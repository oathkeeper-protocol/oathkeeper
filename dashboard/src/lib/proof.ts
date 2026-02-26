/**
 * IDKit returns proof as an ABI-encoded hex string of uint256[8].
 * Decode it into a tuple of 8 bigints for the contract call.
 */
export function decodeProof(
  proofHex: string
): readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] {
  const hex = proofHex.startsWith("0x") ? proofHex.slice(2) : proofHex;
  const result: bigint[] = [];
  for (let i = 0; i < 8; i++) {
    result.push(BigInt("0x" + hex.slice(i * 64, (i + 1) * 64)));
  }
  return result as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
}
