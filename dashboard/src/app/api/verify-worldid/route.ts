import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const proof = await req.json();
  const appId = process.env.NEXT_PUBLIC_WLD_APP_ID;

  if (!appId) {
    return Response.json({ error: "World ID app not configured" }, { status: 500 });
  }

  const response = await fetch(
    `https://developer.world.org/api/v4/verify/${appId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    return Response.json({ error: "Verification failed", details: error }, { status: 400 });
  }

  return Response.json(await response.json());
}
