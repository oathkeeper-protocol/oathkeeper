import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rpId = process.env.WORLD_RP_ID;

  if (!rpId) {
    return Response.json({ error: "World RP ID not configured" }, { status: 500 });
  }

  // IDKit v4 sends the payload in the exact format the v4 verify API expects.
  // Forward as-is — no field remapping needed.
  console.log("World ID v4 verify request:", JSON.stringify(body, null, 2));

  const response = await fetch(
    `https://developer.world.org/api/v4/verify/${rpId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const result = await response.json().catch(() => ({}));
  console.log("World ID v4 verify response:", response.status, JSON.stringify(result));

  if (!response.ok) {
    const code = result?.code || "unknown_error";
    const detail = result?.detail || "";
    // Check individual results for specific errors
    const resultDetails = result?.results?.[0];

    const messages: Record<string, string> = {
      "max_verifications_reached": "This World ID has already been used for this action. Each person can only register once.",
      "all_verifications_failed": resultDetails?.detail || "Proof verification failed.",
      "invalid_proof": "Invalid proof — the verification could not be completed.",
      "not_found": "App not found or inactive. Check your World ID configuration.",
    };

    const message = messages[code] || `Verification failed: ${detail || code}`;
    return Response.json({ error: message, code, details: result }, { status: 400 });
  }

  return Response.json(result);
}
