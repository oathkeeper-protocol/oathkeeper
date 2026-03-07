import { signRequest } from "@worldcoin/idkit/signing";

export async function POST() {
  const signingKey = process.env.RP_SIGNING_KEY;

  if (!signingKey) {
    return Response.json({ error: "RP signing key not configured" }, { status: 500 });
  }

  const rpSignature = signRequest("oathlayer-provider-register", signingKey);

  return Response.json({
    rp_id: process.env.WORLD_RP_ID,
    nonce: rpSignature.nonce,
    created_at: rpSignature.createdAt,
    expires_at: rpSignature.expiresAt,
    signature: rpSignature.sig,
  });
}
