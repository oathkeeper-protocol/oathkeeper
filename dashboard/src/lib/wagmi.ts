import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";
import { defineChain } from "viem";

// Tenderly Virtual Sepolia VNet
export const tenderlyVNet = defineChain({
  id: 11155111,
  name: "Sepolia (Tenderly VNet)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_URL ||
          "https://virtual.sepolia.eu.rpc.tenderly.co/47ad454d-8109-4ccb-9285-7ab201835e5d",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Tenderly",
      url:
        process.env.NEXT_PUBLIC_TENDERLY_EXPLORER ||
        "https://dashboard.tenderly.co/robbyn/project/testnet/5c780e4f-4df5-4a50-b221-2342cd4b713e",
    },
  },
  testnet: true,
});

export const config = getDefaultConfig({
  appName: "OathKeeper",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "oathkeeper-hackathon",
  chains: [tenderlyVNet, sepolia],
  ssr: true,
});
