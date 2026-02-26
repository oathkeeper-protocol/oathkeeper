"use client";

import { useState, useEffect } from "react";
import {
  MiniKit,
  VerificationLevel,
  ISuccessResult,
  MiniAppSendTransactionPayload,
} from "@worldcoin/minikit-js";
import { motion, AnimatePresence } from "framer-motion";
import { encodeFunctionData, parseAbi } from "viem";

type Screen = "home" | "register" | "slas" | "claim";

const SLA_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_SLA_CONTRACT_ADDRESS || "0xB71247A5744b5c0e16a2b4374A34aCa8319703dB";

const FILE_CLAIM_ABI = parseAbi([
  "function fileClaim(uint256 slaId, string description) external",
]);

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [isInWorldApp, setIsInWorldApp] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [claimForm, setClaimForm] = useState({ slaId: "0", description: "" });
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  useEffect(() => {
    setIsInWorldApp(MiniKit.isInstalled());
  }, []);

  const handleProviderRegister = async () => {
    setRegistering(true);
    setTxStatus(null);

    try {
      if (!MiniKit.isInstalled()) {
        throw new Error("Please open in World App");
      }

      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: "oathkeeper-provider-register",
        signal: "",
        verification_level: VerificationLevel.Orb,
      });

      if (finalPayload.status === "error") {
        throw new Error("World ID verification failed");
      }

      const proof = finalPayload as ISuccessResult;

      const res = await fetch("/api/register-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: proof.proof,
          merkle_root: proof.merkle_root,
          nullifier_hash: proof.nullifier_hash,
          verification_level: proof.verification_level,
        }),
      });

      if (!res.ok) throw new Error("Registration failed");

      const data = await res.json();
      setTxStatus(`Registered! CRE will relay to Sepolia. Tx: ${data.txHash?.slice(0, 12)}...`);
      setRegistered(true);
    } catch (err: unknown) {
      setTxStatus(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRegistering(false);
    }
  };

  const handleFileClaim = async () => {
    if (!claimForm.description) return;
    setClaimStatus("pending");

    try {
      if (!MiniKit.isInstalled()) {
        // Outside World App — show error
        throw new Error("Please open in World App to file claims");
      }

      const calldata = encodeFunctionData({
        abi: FILE_CLAIM_ABI,
        functionName: "fileClaim",
        args: [BigInt(claimForm.slaId), claimForm.description],
      });

      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: SLA_CONTRACT_ADDRESS,
            abi: FILE_CLAIM_ABI,
            functionName: "fileClaim",
            args: [BigInt(claimForm.slaId), claimForm.description],
          },
        ],
      });

      const payload = finalPayload as MiniAppSendTransactionPayload;
      if (payload.status === "error") throw new Error("Transaction rejected");

      setClaimStatus("success");
    } catch (err: unknown) {
      console.error(err);
      setClaimStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">OK</div>
          <span className="font-semibold text-lg">OathKeeper</span>
        </div>
        {isInWorldApp && (
          <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">World App</span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {screen === "home" && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 px-5 py-4 space-y-4"
          >
            <div>
              <h1 className="text-2xl font-bold">SLA Enforcement</h1>
              <p className="text-gray-400 text-sm mt-1">
                Automated penalty enforcement for real-world service agreements, powered by Chainlink CRE
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Active SLAs", value: "2", color: "text-blue-400" },
                { label: "Bonded ETH", value: "3.5", color: "text-green-400" },
                { label: "Breaches (24h)", value: "1", color: "text-red-400" },
                { label: "Providers", value: "2", color: "text-blue-400" },
              ].map((stat) => (
                <div key={stat.label} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                  <p className="text-gray-400 text-xs">{stat.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => setScreen("register")}
                className="w-full bg-blue-600 text-white rounded-2xl py-4 font-semibold text-base active:opacity-80"
              >
                Register as Provider
              </button>
              <button
                onClick={() => setScreen("slas")}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-2xl py-4 font-semibold text-base active:opacity-80"
              >
                View Active SLAs
              </button>
              <button
                onClick={() => setScreen("claim")}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded-2xl py-4 font-semibold text-base active:opacity-80"
              >
                File a Claim
              </button>
            </div>

            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 mt-4">
              <p className="text-xs font-semibold text-gray-400 mb-3">HOW IT WORKS</p>
              <div className="space-y-2">
                {[
                  { step: "1", text: "Verify identity with World ID (Orb)" },
                  { step: "2", text: "CRE relays your registration to Sepolia" },
                  { step: "3", text: "Bond ETH as SLA collateral" },
                  { step: "4", text: "CRE auto-enforces uptime breaches" },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 text-xs flex items-center justify-center flex-shrink-0">
                      {item.step}
                    </div>
                    <p className="text-sm text-gray-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {screen === "register" && (
          <motion.div
            key="register"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 px-5 py-4"
          >
            <button onClick={() => setScreen("home")} className="text-gray-400 text-sm mb-6">← Back</button>
            <h2 className="text-xl font-bold mb-2">Register as Provider</h2>
            <p className="text-gray-400 text-sm mb-6">
              Verify with World ID on World Chain. Chainlink CRE will relay your registration to Sepolia automatically.
            </p>

            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 mb-6">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="text-blue-400">World App</span>
                <span>→ World Chain</span>
                <span className="text-orange-400">→ CRE</span>
                <span>→ Sepolia</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                World ID proof verified on World Chain, CRE bridges registration cross-chain
              </p>
            </div>

            {registered ? (
              <div className="bg-green-400/10 border border-green-400/20 rounded-2xl p-4">
                <p className="text-green-400 font-semibold">✓ Registered!</p>
                <p className="text-sm text-gray-400 mt-1">{txStatus}</p>
              </div>
            ) : (
              <button
                onClick={handleProviderRegister}
                disabled={registering}
                className="w-full bg-blue-600 disabled:opacity-50 text-white rounded-2xl py-4 font-semibold text-base active:opacity-80"
              >
                {registering ? "Verifying with World ID..." : "Verify with World ID"}
              </button>
            )}

            {txStatus && !registered && (
              <p className="text-red-400 text-sm mt-3">{txStatus}</p>
            )}
          </motion.div>
        )}

        {screen === "slas" && (
          <motion.div
            key="slas"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 px-5 py-4"
          >
            <button onClick={() => setScreen("home")} className="text-gray-400 text-sm mb-6">← Back</button>
            <h2 className="text-xl font-bold mb-4">Active SLAs</h2>
            <div className="space-y-3">
              {[
                { id: 0, provider: "0x742d...bd9", uptime: 99.6, minUptime: 99.5, bond: "1.5 ETH", status: "compliant" },
                { id: 1, provider: "0x8ba1...72", uptime: 98.2, minUptime: 99.0, bond: "2.0 ETH", status: "breached" },
              ].map((sla) => (
                <div key={sla.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-gray-400 font-mono">SLA #{sla.id}</p>
                      <p className="text-sm text-gray-300 mt-0.5">Provider: {sla.provider}</p>
                      <p className="text-xs text-gray-500 mt-1">Bond: {sla.bond} · Min uptime: {sla.minUptime}%</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      sla.status === "compliant"
                        ? "text-green-400 bg-green-400/10"
                        : "text-red-400 bg-red-400/10"
                    }`}>
                      {sla.status === "compliant" ? `${sla.uptime}%` : `BREACH ${sla.uptime}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {screen === "claim" && (
          <motion.div
            key="claim"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 px-5 py-4"
          >
            <button onClick={() => setScreen("home")} className="text-gray-400 text-sm mb-6">← Back</button>
            <h2 className="text-xl font-bold mb-2">File a Claim</h2>
            <p className="text-gray-400 text-sm mb-6">
              Report a maintenance issue. Your World App wallet signs the transaction directly.
            </p>

            {claimStatus === "success" ? (
              <div className="bg-green-400/10 border border-green-400/20 rounded-2xl p-4">
                <p className="text-green-400 font-semibold">✓ Claim filed on-chain!</p>
                <p className="text-sm text-gray-400 mt-1">CRE will monitor provider response time and auto-enforce if breached.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">SLA ID</label>
                  <input
                    type="number"
                    value={claimForm.slaId}
                    onChange={e => setClaimForm({ ...claimForm, slaId: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 text-white focus:outline-none"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Description</label>
                  <textarea
                    rows={4}
                    value={claimForm.description}
                    onChange={e => setClaimForm({ ...claimForm, description: e.target.value })}
                    placeholder="Describe the maintenance issue..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 text-white focus:outline-none resize-none"
                  />
                </div>
                <button
                  onClick={handleFileClaim}
                  disabled={claimStatus === "pending" || !claimForm.description}
                  className="w-full bg-blue-600 disabled:opacity-50 text-white rounded-2xl py-4 font-semibold active:opacity-80"
                >
                  {claimStatus === "pending" ? "Submitting..." : "Submit Claim"}
                </button>
                {claimStatus === "error" && (
                  <p className="text-red-400 text-sm">Failed to submit. Make sure you are in World App.</p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
