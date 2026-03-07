export const SLAEnforcement_ABI = [
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
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "slaId", type: "uint256" },
      { indexed: true, internalType: "address", name: "arbitrator", type: "address" },
      { indexed: false, internalType: "bool", name: "upheld", type: "bool" },
    ],
    name: "ArbitrationDecision",
    type: "event",
  },
] as const;
