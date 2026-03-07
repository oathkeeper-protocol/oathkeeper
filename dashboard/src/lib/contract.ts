import { type Address } from "viem";

export const SLA_CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_SLA_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000"
) as Address;

// Block number where the contract was deployed — used for getLogs fromBlock
export const DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_DEPLOY_BLOCK || "0"
);

export const SLA_ABI = [
  // --- View functions ---
  {
    inputs: [],
    name: "slaCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "claimCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "breachCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "slas",
    outputs: [
      { internalType: "address", name: "provider", type: "address" },
      { internalType: "address", name: "tenant", type: "address" },
      { internalType: "string", name: "serviceName", type: "string" },
      { internalType: "uint256", name: "bondAmount", type: "uint256" },
      { internalType: "uint256", name: "responseTimeHrs", type: "uint256" },
      { internalType: "uint256", name: "minUptimeBps", type: "uint256" },
      { internalType: "uint256", name: "penaltyBps", type: "uint256" },
      { internalType: "uint256", name: "createdAt", type: "uint256" },
      { internalType: "bool", name: "active", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "claims",
    outputs: [
      { internalType: "uint256", name: "slaId", type: "uint256" },
      { internalType: "address", name: "tenant", type: "address" },
      { internalType: "string", name: "description", type: "string" },
      { internalType: "uint256", name: "filedAt", type: "uint256" },
      { internalType: "bool", name: "resolved", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "verifiedProviders",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "verifiedArbitrators",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "providerCompliance",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "slaId", type: "uint256" }],
    name: "getCollateralRatio",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // --- Write functions ---
  {
    inputs: [
      { internalType: "uint256", name: "root", type: "uint256" },
      { internalType: "uint256", name: "nullifierHash", type: "uint256" },
      { internalType: "uint256[8]", name: "proof", type: "uint256[8]" },
    ],
    name: "registerProvider",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "root", type: "uint256" },
      { internalType: "uint256", name: "nullifierHash", type: "uint256" },
      { internalType: "uint256[8]", name: "proof", type: "uint256[8]" },
    ],
    name: "registerArbitrator",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "tenant", type: "address" },
      { internalType: "string", name: "serviceName", type: "string" },
      { internalType: "uint256", name: "responseTimeHrs", type: "uint256" },
      { internalType: "uint256", name: "minUptimeBps", type: "uint256" },
      { internalType: "uint256", name: "penaltyBps", type: "uint256" },
    ],
    name: "createSLA",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "slaId", type: "uint256" },
      { internalType: "string", name: "description", type: "string" },
    ],
    name: "fileClaim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "slaId", type: "uint256" },
      { internalType: "bool", name: "upheld", type: "bool" },
    ],
    name: "arbitrate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // --- Events ---
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "provider", type: "address" },
      { indexed: false, internalType: "uint256", name: "nullifierHash", type: "uint256" },
    ],
    name: "ProviderRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "arbitrator", type: "address" },
      { indexed: false, internalType: "uint256", name: "nullifierHash", type: "uint256" },
    ],
    name: "ArbitratorRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "slaId", type: "uint256" },
      { indexed: true, internalType: "address", name: "provider", type: "address" },
      { indexed: true, internalType: "address", name: "tenant", type: "address" },
    ],
    name: "SLACreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "claimId", type: "uint256" },
      { indexed: true, internalType: "uint256", name: "slaId", type: "uint256" },
      { indexed: false, internalType: "address", name: "tenant", type: "address" },
    ],
    name: "ClaimFiled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "slaId", type: "uint256" },
      { indexed: true, internalType: "address", name: "provider", type: "address" },
      { indexed: false, internalType: "uint256", name: "uptimeBps", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "penaltyAmount", type: "uint256" },
    ],
    name: "SLABreached",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "provider", type: "address" },
    ],
    name: "ComplianceCheckPassed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "provider", type: "address" },
      { indexed: false, internalType: "string", name: "reason", type: "string" },
    ],
    name: "ComplianceCheckFailed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "slaId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "riskScore", type: "uint256" },
      { indexed: false, internalType: "string", name: "prediction", type: "string" },
    ],
    name: "BreachWarning",
    type: "event",
  },
] as const;
