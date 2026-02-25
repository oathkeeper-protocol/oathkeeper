"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IDKitWidget, VerificationLevel } from "@worldcoin/idkit";

export default function RegisterProvider() {
  const [verified, setVerified] = useState(false);
  const [nullifierHash, setNullifierHash] = useState<string | null>(null);
  const [bondAmount, setBondAmount] = useState("0.1");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  const handleVerify = async (proof: { nullifier_hash: string; [key: string]: unknown }) => {
    // Server-side verification
    const res = await fetch("/api/verify-worldid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...proof, action: "oathkeeper-provider-register" }),
    });
    if (!res.ok) throw new Error("World ID verification failed");
    setNullifierHash(proof.nullifier_hash);
    setVerified(true);
  };

  const handleRegister = async () => {
    if (!nullifierHash) return;
    setTxStatus("pending");

    try {
      // In production: call contract via ethers.js
      // const provider = new ethers.BrowserProvider(window.ethereum);
      // const signer = await provider.getSigner();
      // const contract = new ethers.Contract(SLA_CONTRACT_ADDRESS, SLA_ABI, signer);
      // await contract.registerProvider(nullifierHash, { value: ethers.parseEther(bondAmount) });

      // Demo: simulate tx
      await new Promise(resolve => setTimeout(resolve, 2000));
      setTxStatus("success");
    } catch {
      setTxStatus("error");
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white mb-2">Register as Provider</h1>
        <p className="text-gray-400 mb-8">
          Verify your identity with World ID to become an SLA provider. Bond ETH as collateral.
        </p>

        {/* Step 1: World ID */}
        <div className="rounded-xl p-6 border mb-4" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                 style={{ background: verified ? '#22c55e' : 'var(--chainlink-blue)' }}>
              {verified ? '✓' : '1'}
            </div>
            <div>
              <p className="font-medium text-white">Verify Identity</p>
              <p className="text-xs text-gray-400">Orb-level verification prevents Sybil attacks</p>
            </div>
          </div>

          {verified ? (
            <div className="flex items-center gap-2 text-green-400">
              <span>✓</span>
              <span className="text-sm">World ID verified</span>
              <span className="font-mono text-xs text-gray-500 ml-2">{nullifierHash?.slice(0, 12)}...</span>
            </div>
          ) : (
            <IDKitWidget
              app_id={(process.env.NEXT_PUBLIC_WLD_APP_ID || "app_staging_test") as `app_${string}`}
              action="oathkeeper-provider-register"
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
        <div className={`rounded-xl p-6 border mb-4 transition-opacity ${!verified ? 'opacity-50' : ''}`}
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
              disabled={!verified}
              className="flex-1 px-4 py-2 rounded-lg border text-white bg-transparent focus:outline-none"
              style={{ borderColor: 'var(--card-border)' }}
            />
            <span className="flex items-center text-gray-400">ETH</span>
          </div>
        </div>

        {/* Register Button */}
        <button
          onClick={handleRegister}
          disabled={!verified || txStatus === "pending"}
          className="w-full py-3 rounded-lg font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: 'var(--chainlink-blue)' }}
        >
          {txStatus === "pending" ? "Registering..." : txStatus === "success" ? "✓ Registered!" : "Register as Provider"}
        </button>

        {txStatus === "success" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-lg text-green-400 border border-green-400/20 bg-green-400/5"
          >
            Provider registered successfully! You can now create SLA agreements.
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
