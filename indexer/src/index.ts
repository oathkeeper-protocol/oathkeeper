import { ponder } from "ponder:registry";
import {
  sla,
  provider,
  breach,
  breachWarning,
  claim,
  arbitration,
} from "ponder:schema";

// --- Provider Registration ---

ponder.on("SLAEnforcement:ProviderRegistered", async ({ event, context }) => {
  const { db } = context;
  const ts = new Date(Number(event.block.timestamp) * 1000);

  await db
    .insert(provider)
    .values({
      id: event.args.provider,
      verified: true,
      compliant: false,
      complianceStatus: 0,
      registeredAt: ts,
      blockNumber: event.block.number,
    })
    .onConflictDoUpdate({ verified: true });
});

// --- SLA Created ---

ponder.on("SLAEnforcement:SLACreated", async ({ event, context }) => {
  const { db, client } = context;
  const ts = new Date(Number(event.block.timestamp) * 1000);

  // Read full SLA struct from contract
  const slaData = await client.readContract({
    address: event.log.address,
    abi: [
      {
        inputs: [{ type: "uint256" }],
        name: "slas",
        outputs: [
          { name: "provider", type: "address" },
          { name: "tenant", type: "address" },
          { name: "serviceName", type: "string" },
          { name: "bondAmount", type: "uint256" },
          { name: "responseTimeHrs", type: "uint256" },
          { name: "minUptimeBps", type: "uint256" },
          { name: "penaltyBps", type: "uint256" },
          { name: "breachCount", type: "uint256" },
          { name: "active", type: "bool" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "slas",
    args: [event.args.slaId],
  });

  await db.insert(sla).values({
    id: `${event.args.slaId}`,
    slaId: event.args.slaId,
    provider: event.args.provider,
    tenant: event.args.tenant,
    serviceName: slaData[2] || "Unknown",
    bondAmount: slaData[3].toString(),
    responseTimeHrs: slaData[4],
    minUptimeBps: slaData[5],
    penaltyBps: slaData[6],
    active: true,
    breachCount: 0,
    totalSlashed: "0",
    createdAt: ts,
    lastUpdated: ts,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

// --- SLA Breached ---

ponder.on("SLAEnforcement:SLABreached", async ({ event, context }) => {
  const { db } = context;
  const ts = new Date(Number(event.block.timestamp) * 1000);
  const id = `${event.transaction.hash}-${event.log.logIndex}`;

  await db.insert(breach).values({
    id,
    slaId: event.args.slaId,
    provider: event.args.provider,
    uptimeBps: event.args.uptimeBps,
    penaltyAmount: event.args.penaltyAmount.toString(),
    timestamp: ts,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });

  // Update SLA aggregate state
  await db
    .update(sla, { id: `${event.args.slaId}` })
    .set((row) => ({
      breachCount: row.breachCount + 1,
      totalSlashed: (BigInt(row.totalSlashed) + event.args.penaltyAmount).toString(),
      lastUpdated: ts,
    }));
});

// --- Breach Warning ---

ponder.on("SLAEnforcement:BreachWarning", async ({ event, context }) => {
  const { db } = context;
  const ts = new Date(Number(event.block.timestamp) * 1000);
  const id = `${event.transaction.hash}-${event.log.logIndex}`;

  // Parse tally and summary from prediction string
  // Format: "[3-0 BREACH] Agent: reasoning; Agent: reasoning; ..."
  const prediction = event.args.prediction;
  let tally: string | null = null;
  let summary: string | null = null;

  const tallyMatch = prediction.match(/^\[([^\]]+)\]/);
  if (tallyMatch) {
    tally = tallyMatch[1];
    summary = prediction.slice(tallyMatch[0].length).trim();
  }

  await db.insert(breachWarning).values({
    id,
    slaId: event.args.slaId,
    riskScore: Number(event.args.riskScore),
    prediction,
    tally,
    summary,
    penalized: false,
    timestamp: ts,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });

  // Update SLA latest risk/verdict
  await db
    .update(sla, { id: `${event.args.slaId}` })
    .set({
      latestRiskScore: Number(event.args.riskScore),
      latestVerdict: tally,
      lastUpdated: ts,
    });
});

// --- Claim Filed ---

ponder.on("SLAEnforcement:ClaimFiled", async ({ event, context }) => {
  const { db } = context;
  const ts = new Date(Number(event.block.timestamp) * 1000);
  const id = `${event.transaction.hash}-${event.log.logIndex}`;

  await db.insert(claim).values({
    id,
    claimId: event.args.claimId,
    slaId: event.args.slaId,
    tenant: event.args.tenant,
    timestamp: ts,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

// --- Compliance Check Passed ---

ponder.on("SLAEnforcement:ComplianceCheckPassed", async ({ event, context }) => {
  const { db } = context;

  await db
    .update(provider, { id: event.args.provider })
    .set({ compliant: true, complianceStatus: 1 });
});

// --- Compliance Check Failed ---

ponder.on("SLAEnforcement:ComplianceCheckFailed", async ({ event, context }) => {
  const { db } = context;

  await db
    .update(provider, { id: event.args.provider })
    .set({ compliant: false, complianceStatus: 2 });
});

// --- Arbitration Decision ---

ponder.on("SLAEnforcement:ArbitrationDecision", async ({ event, context }) => {
  const { db } = context;
  const ts = new Date(Number(event.block.timestamp) * 1000);
  const id = `${event.transaction.hash}-${event.log.logIndex}`;

  await db.insert(arbitration).values({
    id,
    slaId: event.args.slaId,
    arbitrator: event.args.arbitrator,
    upheld: event.args.upheld,
    timestamp: ts,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});
