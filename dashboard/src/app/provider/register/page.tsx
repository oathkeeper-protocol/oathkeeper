"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IDKitWidget, VerificationLevel, type ISuccessResult } from "@worldcoin/idkit";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SLA_CONTRACT_ADDRESS, SLA_ABI } from "@/lib/contract";
import { decodeProof } from "@/lib/proof";

export default function RegisterProvider() {
  const { address, isConnected } = useAccount();
  const [proof, setProof] = useState<ISuccessResult | null>(null);
  const [bondAmount, setBondAmount] = useState("0.1");

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleVerify = async (result: ISuccessResult) => {
    const res = await fetch("/api/verify-worldid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...result, action: "oathlayer-provider-register" }),
    });
    if (!res.ok) throw new Error("World ID verification failed");
    setProof(result);
  };

  const handleRegister = () => {
    if (!proof) return;
    writeContract({
      address: SLA_CONTRACT_ADDRESS,
      abi: SLA_ABI,
      functionName: "registerProvider",
      args: [
        BigInt(proof.merkle_root),
        BigInt(proof.nullifier_hash),
        decodeProof(proof.proof),
      ],
      value: parseEther(bondAmount),
    });
  };

  const isLoading = isPending || isConfirming;

  return (
    <div className="max-w-xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white mb-2">Register as Provider</h1>
        <p className="text-gray-400 mb-8">
          Verify your identity with World ID to become an SLA provider. Bond ETH as collateral.
        </p>

        {!isConnected && (
          <div className="rounded-xl p-6 border mb-4 flex flex-col items-center gap-4"
               style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            <p className="text-gray-400 text-sm">Connect your wallet to register</p>
            <ConnectButton />
          </div>
        )}

        {/* Step 1: World ID */}
        <div className={`rounded-xl p-6 border mb-4 transition-opacity ${!isConnected ? 'opacity-40 pointer-events-none' : ''}`}
             style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                 style={{ background: proof ? '#22c55e' : 'var(--chainlink-blue)' }}>
              {proof ? '✓' : '1'}
            </div>
            <div>
              <p className="font-medium text-white">Verify Identity</p>
              <p className="text-xs text-gray-400">Orb-level verification prevents Sybil attacks</p>
            </div>
          </div>

          {proof ? (
            <div className="flex items-center gap-2 text-green-400">
              <span>✓</span>
              <span className="text-sm">World ID verified</span>
              <span className="font-mono text-xs text-gray-500 ml-2">{proof.nullifier_hash.slice(0, 14)}...</span>
            </div>
          ) : (
            <IDKitWidget
              app_id={(process.env.NEXT_PUBLIC_WLD_APP_ID || "app_staging_oathlayer") as `app_${string}`}
              action="oathlayer-provider-register"
              signal={address}
              verification_level={VerificationLevel.Device}
              handleVerify={handleVerify}
              onSuccess={() => {}}
            >
              {({ open }: { open: () => void }) => (
                <button
                  onClick={open}
                  className="w-full py-3 rounded-lg font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--chainlink-blue)' }}
                >
                  Verify with World ID
                </button>
              )}
            </IDKitWidget>
          )}
        </div>

        {/* Step 2: Bond amount */}
        <div className={`rounded-xl p-6 border mb-4 transition-opacity ${!proof ? 'opacity-50' : ''}`}
             style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                 style={{ background: 'var(--chainlink-blue)' }}>
              2
            </div>
            <div>
              <p className="font-medium text-white">Bond Collateral</p>
              <p className="text-xs text-gray-400">Minimum 0.1 ETH — slashed on SLA violations</p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type="number"
              value={bondAmount}
              onChange={e => setBondAmount(e.target.value)}
              min="0.1"
              step="0.1"
              disabled={!proof}
              className="flex-1 px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none"
              style={{ borderColor: 'var(--card-border)' }}
            />
            <span className="flex items-center text-gray-400">ETH</span>
          </div>
        </div>

        {/* Register Button */}
        <button
          onClick={handleRegister}
          disabled={!proof || !isConnected || isLoading}
          className="w-full py-3 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--chainlink-blue)' }}
        >
          {isLoading ? "Registering..." : isSuccess ? "✓ Registered!" : "Register as Provider"}
        </button>

        {txHash && !isSuccess && (
          <p className="mt-3 text-xs text-gray-400 text-center font-mono">
            Tx: {txHash.slice(0, 20)}... confirming...
          </p>
        )}

        {isSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-lg text-green-400 border border-green-400/20 bg-green-400/5"
          >
            <p className="font-medium">Provider registered on-chain!</p>
            <p className="text-xs mt-1 font-mono text-gray-400">
              Tx:{" "}
              <a
                href={`${process.env.NEXT_PUBLIC_TENDERLY_EXPLORER}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {txHash?.slice(0, 20)}...
              </a>
            </p>
          </motion.div>
        )}

        {error && (
          <p className="mt-3 text-red-400 text-sm">
            {error.message.includes("revert") ? "Contract reverted — already registered?" : error.message}
          </p>
        )}
      </motion.div>
    </div>
  );
}

