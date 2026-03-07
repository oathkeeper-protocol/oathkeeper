import "dotenv/config";
import { createConfig } from "ponder";
import { SLAEnforcement_ABI } from "./abis/SLAEnforcement";

export default createConfig({
  chains: {
    sepolia: {
      id: 11155111,
      rpc: process.env.PONDER_RPC_URL || "https://virtual.sepolia.eu.rpc.tenderly.co/47ad454d-8109-4ccb-9285-7ab201835e5d",
    },
  },
  contracts: {
    SLAEnforcement: {
      chain: "sepolia",
      abi: SLAEnforcement_ABI,
      address: (process.env.SLA_CONTRACT_ADDRESS || "0x7c8C2E0D488d2785040171f4C087B0EA7637DE91") as `0x${string}`,
      startBlock: parseInt(process.env.DEPLOYMENT_BLOCK || "10336578"),
    },
  },
});
