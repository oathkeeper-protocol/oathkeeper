import { NextRequest } from "next/server";
import { createWalletClient, http, parseAbi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// World Chain mainnet
const worldChain = {
  id: 480,
  name: "World Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://worldchain-mainnet.g.alchemy.com/public"] } },
};

const REGISTRY_ABI = parseAbi([
  "function requestProviderRegistration(uint256 root, uint256 nullifierHash, uint256[8] calldata proof) external",
]);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { proof, merkle_root, nullifier_hash } = body;

  // Step 1: Verify proof via World ID API
  const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;
  const verifyRes = await fetch(`https://developer.world.org/api/v4/verify/${appId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proof,
      merkle_root,
      nullifier_hash,
      verification_level: body.verification_level,
      action: "oathkeeper-provider-register",
    }),
  });

  if (!verifyRes.ok) {
    return Response.json({ error: "World ID verification failed" }, { status: 400 });
  }

  // Step 2: Submit to WorldChainRegistry contract
  const privateKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    return Response.json({ error: "Relayer not configured" }, { status: 500 });
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: worldChain, transport: http() });

  const registryAddress = getAddress(
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT || "0x0000000000000000000000000000000000000000"
  );

  // Parse proof array from IDKit (it's a packed hex string)
  // IDKit returns proof as a hex string that encodes 8 uint256 values
  const proofHex = proof.replace("0x", "");
  const proofArray: bigint[] = [];
  for (let i = 0; i < 8; i++) {
    proofArray.push(BigInt("0x" + proofHex.slice(i * 64, (i + 1) * 64)));
  }

  const txHash = await walletClient.writeContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: "requestProviderRegistration",
    args: [BigInt(merkle_root), BigInt(nullifier_hash), proofArray as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]],
  });

  return Response.json({ ok: true, txHash });
}
