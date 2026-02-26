import { type Address } from "viem";

export const SLA_CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_SLA_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000"
) as Address;

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
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "slas",
    outputs: [
      { internalType: "address", name: "provider", type: "address" },
      { internalType: "address", name: "tenant", type: "address" },
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
] as const;

// Mock data for dashboard display (hydrated with on-chain data when available)
export const MOCK_SLAS = [
  {
    id: 0,
    provider: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bd9",
    tenant: "0x123f681646d4a755815f9cb19e1acc8565a0c2ac",
    bondAmount: "1.5",
    responseTimeHrs: 48,
    minUptimeBps: 9950,
    penaltyBps: 500,
    active: true,
    complianceHistory: [
      { time: "00:00", uptime: 99.8 },
      { time: "03:00", uptime: 99.7 },
      { time: "06:00", uptime: 99.9 },
      { time: "09:00", uptime: 98.2 },
      { time: "12:00", uptime: 99.6 },
      { time: "15:00", uptime: 99.5 },
      { time: "18:00", uptime: 99.8 },
      { time: "21:00", uptime: 99.7 },
    ],
  },
  {
    id: 1,
    provider: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
    tenant: "0x456a681646d4a755815f9cb19e1acc8565a0c2ac",
    bondAmount: "2.0",
    responseTimeHrs: 24,
    minUptimeBps: 9900,
    penaltyBps: 300,
    active: true,
    complianceHistory: [
      { time: "00:00", uptime: 99.5 },
      { time: "03:00", uptime: 99.6 },
      { time: "06:00", uptime: 99.4 },
      { time: "09:00", uptime: 99.7 },
      { time: "12:00", uptime: 99.8 },
      { time: "15:00", uptime: 99.6 },
      { time: "18:00", uptime: 99.9 },
      { time: "21:00", uptime: 99.5 },
    ],
  },
];

export const MOCK_BREACHES = [
  {
    slaId: 0,
    provider: "0x742d35Cc...",
    uptimeBps: 9820,
    penaltyAmount: "0.075",
    timestamp: "2026-02-26T09:15:00Z",
    txHash: "0xabc123...",
  },
];
