// workflow.ts
// OathKeeper — Chainlink CRE Workflow for SLA Enforcement
// Triggers: Cron (every 15 min) + EVM Log (ClaimFiled events)
// Actions: Read uptime API → check breach → write recordBreach() on-chain

import { workflow, triggers, capabilities } from "@chainlink/cre-sdk";

const { httpClient, evmClient } = capabilities;

// Contract deployed on Tenderly Virtual TestNet (Sepolia fork)
const SLA_CONTRACT = process.env.SLA_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

// Minimal ABI for the functions we need
const SLA_ABI = [
  {
    "inputs": [],
    "name": "slaCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "slas",
    "outputs": [
      { "internalType": "address", "name": "provider", "type": "address" },
      { "internalType": "address", "name": "tenant", "type": "address" },
      { "internalType": "uint256", "name": "bondAmount", "type": "uint256" },
      { "internalType": "uint256", "name": "responseTimeHrs", "type": "uint256" },
      { "internalType": "uint256", "name": "minUptimeBps", "type": "uint256" },
      { "internalType": "uint256", "name": "penaltyBps", "type": "uint256" },
      { "internalType": "uint256", "name": "createdAt", "type": "uint256" },
      { "internalType": "bool", "name": "active", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "slaId", "type": "uint256" },
      { "internalType": "uint256", "name": "uptimeBps", "type": "uint256" },
      { "internalType": "uint256", "name": "penaltyBps", "type": "uint256" }
    ],
    "name": "recordBreach",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "claimId", "type": "uint256" },
      { "indexed": true, "internalType": "uint256", "name": "slaId", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "tenant", "type": "address" }
    ],
    "name": "ClaimFiled",
    "type": "event"
  }
] as const;

const UPTIME_API_BASE = process.env.UPTIME_API_URL || "http://localhost:3001";

export default workflow({
  triggers: [
    // Proactive: check every 15 minutes for compliance
    triggers.cron({ schedule: "*/15 * * * *" }),

    // Reactive: immediately check when a new claim is filed
    triggers.evmLog({
      address: SLA_CONTRACT,
      event: "ClaimFiled(uint256 indexed claimId, uint256 indexed slaId, address tenant)",
    }),
  ],

  async callback({ trigger, secrets }) {
    console.log(`[OathKeeper] Workflow triggered: ${trigger.type}`);

    // 1. Get total SLA count from contract
    const slaCount = await evmClient.read({
      address: SLA_CONTRACT,
      abi: SLA_ABI,
      functionName: "slaCount",
    }) as bigint;

    console.log(`[OathKeeper] Checking ${slaCount} SLAs for compliance`);

    const breachResults: Array<{
      slaId: number;
      provider: string;
      uptimeBps: number;
      minUptimeBps: number;
      penaltyBps: number;
    }> = [];

    // 2. Iterate over all active SLAs
    for (let i = 0; i < Number(slaCount); i++) {
      const sla = await evmClient.read({
        address: SLA_CONTRACT,
        abi: SLA_ABI,
        functionName: "slas",
        args: [BigInt(i)],
      }) as {
        provider: string;
        tenant: string;
        bondAmount: bigint;
        responseTimeHrs: bigint;
        minUptimeBps: bigint;
        penaltyBps: bigint;
        createdAt: bigint;
        active: boolean;
      };

      if (!sla.active) {
        console.log(`[OathKeeper] SLA ${i} is inactive, skipping`);
        continue;
      }

      const apiKey = secrets?.API_KEY || "demo-key";

      // 3. Fetch off-chain uptime metrics from provider API
      let uptimeBps: number;
      try {
        const response = await httpClient.get(
          `${UPTIME_API_BASE}/provider/${sla.provider}/uptime`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        const data = response.json() as { uptimePercent: number; provider: string };
        uptimeBps = Math.round(data.uptimePercent * 100); // Convert 99.5% → 9950 bps
        console.log(`[OathKeeper] SLA ${i}: provider ${sla.provider} uptime ${data.uptimePercent}% (${uptimeBps} bps)`);
      } catch (err) {
        console.error(`[OathKeeper] Failed to fetch uptime for SLA ${i}:`, err);
        continue;
      }

      const minUptimeBps = Number(sla.minUptimeBps);
      const penaltyBps = Number(sla.penaltyBps);

      // 4. Check if SLA is breached
      if (uptimeBps < minUptimeBps) {
        console.log(`[OathKeeper] BREACH DETECTED: SLA ${i} — uptime ${uptimeBps} < minimum ${minUptimeBps}`);

        breachResults.push({
          slaId: i,
          provider: sla.provider,
          uptimeBps,
          minUptimeBps,
          penaltyBps,
        });

        // 5. Record breach on-chain — slashes bond, transfers penalty to tenant
        await evmClient.write({
          address: SLA_CONTRACT,
          abi: SLA_ABI,
          functionName: "recordBreach",
          args: [BigInt(i), BigInt(uptimeBps), BigInt(penaltyBps)],
        });

        console.log(`[OathKeeper] Breach recorded on-chain for SLA ${i}. Penalty: ${penaltyBps} bps of bond`);
      } else {
        console.log(`[OathKeeper] SLA ${i} compliant: uptime ${uptimeBps} >= minimum ${minUptimeBps}`);
      }
    }

    console.log(`[OathKeeper] Scan complete. Breaches detected: ${breachResults.length}`);
    return { breachesDetected: breachResults.length, breaches: breachResults };
  },
});
