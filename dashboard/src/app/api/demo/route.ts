// Proxy demo control commands to mock API server
// Used by the dashboard Demo Controls panel during live demos

const MOCK_API = process.env.MOCK_API_URL || "http://localhost:3001";
const ADMIN_TOKEN = process.env.MOCK_API_ADMIN_SECRET || "demo-secret";

export async function POST(req: Request) {
  const { action, ...params } = await req.json();

  const endpoints: Record<string, { path: string; body?: object }> = {
    "trigger-scan": { path: "/trigger-scan", body: { broadcast: true, triggerIndex: 0 } },
    "demo-breach": { path: "/demo-breach", body: { uptime: params.uptime ?? 94.0 } },
    "set-uptime": { path: "/set-uptime", body: { uptime: params.uptime ?? 99.9 } },
    reset: { path: "/reset" },
  };

  const endpoint = endpoints[action];
  if (!endpoint) {
    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  try {
    const res = await fetch(`${MOCK_API}${endpoint.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": ADMIN_TOKEN,
      },
      body: JSON.stringify(endpoint.body ?? {}),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (e: any) {
    return Response.json(
      { error: "Mock API unreachable", detail: e.message },
      { status: 502 }
    );
  }
}

export async function GET() {
  try {
    const res = await fetch(`${MOCK_API}/status`);
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: "Mock API unreachable" }, { status: 502 });
  }
}
