const PONDER_URL = process.env.NEXT_PUBLIC_PONDER_URL || "http://localhost:42069";

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${PONDER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data as T;
}

// --- Types matching existing dashboard shapes ---

export type PonderSLA = {
  id: string;
  slaId: string;
  provider: string;
  tenant: string;
  serviceName: string;
  bondAmount: string;
  responseTimeHrs: string;
  minUptimeBps: string;
  penaltyBps: string;
  active: boolean;
  breachCount: number;
  totalSlashed: string;
  latestRiskScore: number | null;
  latestVerdict: string | null;
  createdAt: string;
  blockNumber: string;
};

export type PonderBreach = {
  id: string;
  slaId: string;
  provider: string;
  uptimeBps: string;
  penaltyAmount: string;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
};

export type PonderWarning = {
  id: string;
  slaId: string;
  riskScore: number;
  prediction: string;
  tally: string | null;
  summary: string | null;
  penalized: boolean;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
};

export type PonderClaim = {
  id: string;
  claimId: string;
  slaId: string;
  tenant: string;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
};

// --- Queries ---

export async function fetchDashboardData() {
  return gql<{
    slas: { items: PonderSLA[] };
    breachs: { items: PonderBreach[] };
    breachWarnings: { items: PonderWarning[] };
  }>(`{
    slas(orderBy: "slaId", orderDirection: "desc") {
      items {
        id slaId provider tenant serviceName bondAmount
        responseTimeHrs minUptimeBps penaltyBps active
        breachCount totalSlashed latestRiskScore latestVerdict
        createdAt blockNumber
      }
    }
    breachs {
      items {
        id slaId provider uptimeBps penaltyAmount
        blockNumber transactionHash
      }
    }
    breachWarnings {
      items {
        id slaId riskScore prediction tally summary penalized
        blockNumber transactionHash
      }
    }
  }`);
}

export async function fetchSLADetail(slaId: string) {
  const slaIdBigInt = slaId;
  return gql<{
    sla: PonderSLA | null;
    breachs: { items: PonderBreach[] };
    breachWarnings: { items: PonderWarning[] };
    claims: { items: PonderClaim[] };
  }>(`{
    sla(id: "${slaId}") {
      id slaId provider tenant serviceName bondAmount
      responseTimeHrs minUptimeBps penaltyBps active
      breachCount totalSlashed latestRiskScore latestVerdict
      createdAt blockNumber
    }
    breachs(where: { slaId: "${slaIdBigInt}" }) {
      items {
        id slaId provider uptimeBps penaltyAmount
        blockNumber transactionHash
      }
    }
    breachWarnings(where: { slaId: "${slaIdBigInt}" }) {
      items {
        id slaId riskScore prediction tally summary penalized
        blockNumber transactionHash
      }
    }
    claims(where: { slaId: "${slaIdBigInt}" }) {
      items {
        id claimId slaId tenant blockNumber transactionHash
      }
    }
  }`);
}
